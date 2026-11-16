import { Check, Download, FolderPlus, Folder, Heart, ImagePlus, Inbox, Pencil, ScanSearch, Search, Send, Trash, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Lightbox } from "../components/ImageCard";
import { ConfirmDialog, CopyButton, EmptyState, PageHeader, Segmented, Spinner } from "../components/ui";
import { api, downloadUrl, fileUrl, type ItemType, type LibraryItem, type Project, saveBlob } from "../lib/api";
import { cx, formatDate, plural } from "../lib/util";
import { useStudio } from "../state/studio";
import type { GenerateHandoff } from "./Generate";

type ProjectWithCount = Project & { count: number };
const TYPE_LABEL: Record<ItemType, string> = { image: "Image", analysis: "Analyse", prompt: "Prompt" };

export function LibraryPage() {
  const { toast, toastError } = useStudio();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [type, setType] = useState<"" | ItemType>("");
  const [favorite, setFavorite] = useState(false);
  const [tag, setTag] = useState("");
  const [category, setCategory] = useState("");
  const [projectId, setProjectId] = useState("");

  const [items, setItems] = useState<LibraryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<{ tags: Array<{ tag: string; count: number }>; categories: string[]; projects: ProjectWithCount[] }>({ tags: [], categories: [], projects: [] });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null);
  const [newProject, setNewProject] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<number | null>(null);

  const openId = params.get("item");
  const [detail, setDetail] = useState<LibraryItem | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  const query = useMemo(() => ({ q: debouncedQ, type, favorite, tag, category, projectId }), [debouncedQ, type, favorite, tag, category, projectId]);

  const loadMeta = useCallback(() => api.libraryMeta().then(setMeta).catch(() => undefined), []);
  // Numéro de la dernière requête : une réponse plus ancienne (filtre changé entre-temps) est ignorée.
  const lastRequest = useRef(0);
  const load = useCallback(
    async (offset = 0) => {
      const id = ++lastRequest.current;
      setLoading(true);
      try {
        const res = await api.library({ ...query, limit: 60, offset });
        if (id !== lastRequest.current) return;
        setItems((cur) => (offset === 0 ? res.items : [...cur, ...res.items]));
        setTotal(res.total);
      } catch (err) {
        if (id === lastRequest.current) toastError(err);
      } finally {
        if (id === lastRequest.current) setLoading(false);
      }
    },
    [query, toastError],
  );

  useEffect(() => {
    void load(0);
    setSelected(new Set());
  }, [load]);
  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    if (!openId) {
      setDetail(null);
      return;
    }
    api
      .item(openId)
      .then(({ item }) => setDetail(item))
      .catch(() => setParams({}, { replace: true }));
  }, [openId, setParams]);

  const refresh = () => {
    void load(0);
    void loadMeta();
  };

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function doDelete(ids: string[]) {
    try {
      const { deleted } = await api.deleteItems(ids);
      toast("success", `${plural(deleted, "élément supprimé", "éléments supprimés")}.`);
      setSelected(new Set());
      if (detail && ids.includes(detail.id)) setParams({}, { replace: true });
      refresh();
    } catch (err) {
      toastError(err);
    } finally {
      setConfirmDelete(null);
    }
  }

  async function downloadSelection(ids: string[]) {
    try {
      const blob = await api.downloadItems(ids);
      saveBlob(blob, `studio-ia-selection-${new Date().toISOString().slice(0, 10)}.zip`);
    } catch (err) {
      toastError(err);
    }
  }

  async function bulk(patch: { projectId?: string | null; favorite?: boolean }) {
    try {
      await api.bulk({ ids: [...selected], ...patch });
      toast("success", "Sélection mise à jour.");
      refresh();
    } catch (err) {
      toastError(err);
    }
  }

  async function createProject(name: string) {
    try {
      const { project } = await api.createProject(name);
      setNewProject(null);
      await loadMeta();
      setProjectId(project.id);
      toast("success", `Projet « ${project.name} » créé.`);
    } catch (err) {
      toastError(err);
    }
  }

  const reuse = (item: LibraryItem) => {
    const state: GenerateHandoff = { prompt: item.prompt, negativePrompt: item.negativePrompt, aspectRatio: item.generation?.aspectRatio };
    navigate("/generer", { state });
  };

  const images = items.filter((i) => i.file);
  const activeProject = meta.projects.find((p) => p.id === projectId);

  return (
    <div className="page">
      <PageHeader eyebrow="Vos créations" title="Bibliothèque" subtitle="Retrouvez vos images générées, vos analyses et vos prompts favoris. Organisez-les en projets, avec des étiquettes et des notes." />

      <div className="library">
        <aside className="panel" style={{ padding: 12 }}>
          <div className="row-between" style={{ padding: "4px 6px 8px" }}>
            <span className="label">Projets</span>
            <button className="btn btn-sm btn-ghost btn-icon" aria-label="Nouveau projet" onClick={() => setNewProject("")} data-testid="new-project">
              <FolderPlus size={16} />
            </button>
          </div>
          <div className="project-list">
            <button className={cx("project-item", projectId === "" && "active")} onClick={() => setProjectId("")}>
              <Inbox size={16} /> Tout <span className="count" />
            </button>
            <button className={cx("project-item", projectId === "none" && "active")} onClick={() => setProjectId("none")}>
              <Folder size={16} /> Sans projet
            </button>
            {meta.projects.map((p) =>
              renaming === p.id ? (
                <InlineInput
                  key={p.id}
                  initial={p.name}
                  onCancel={() => setRenaming(null)}
                  onSubmit={async (name) => {
                    try {
                      await api.renameProject(p.id, name);
                      setRenaming(null);
                      void loadMeta();
                    } catch (err) {
                      toastError(err);
                    }
                  }}
                />
              ) : (
                <button key={p.id} className={cx("project-item", projectId === p.id && "active")} onClick={() => setProjectId(p.id)} data-testid="project-item">
                  <Folder size={16} /> <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
                  <span className="count">{p.count}</span>
                </button>
              ),
            )}
            {newProject !== null && <InlineInput initial="" placeholder="Nom du projet" onCancel={() => setNewProject(null)} onSubmit={createProject} />}
          </div>
          {activeProject && (
            <div className="row" style={{ padding: "10px 6px 2px" }}>
              <button className="btn btn-sm btn-ghost" onClick={() => setRenaming(activeProject.id)}>
                <Pencil size={14} /> Renommer
              </button>
              <button
                className="btn btn-sm btn-ghost"
                onClick={async () => {
                  try {
                    await api.deleteProject(activeProject.id);
                    setProjectId("");
                    refresh();
                    toast("success", "Projet supprimé (ses éléments sont conservés, sans projet).");
                  } catch (err) {
                    toastError(err);
                  }
                }}
              >
                <Trash size={14} /> Supprimer
              </button>
            </div>
          )}
          {meta.tags.length > 0 && (
            <>
              <div className="divider" style={{ margin: "12px 0" }} />
              <div className="label" style={{ padding: "0 6px 8px" }}>
                Étiquettes
              </div>
              <div className="tag-list" style={{ padding: "0 6px" }}>
                {meta.tags.slice(0, 30).map((t) => (
                  <button key={t.tag} className="chip" style={{ height: 28 }} aria-pressed={tag === t.tag} onClick={() => setTag(tag === t.tag ? "" : t.tag)}>
                    {t.tag} <span className="muted tiny">{t.count}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </aside>

        <section>
          <div className="toolbar">
            <div className="search">
              <Search size={16} />
              <input className="input" type="search" placeholder="Rechercher un prompt, un titre, une étiquette, une note…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher" data-testid="search" />
            </div>
            <Segmented
              label="Type"
              value={type}
              onChange={setType}
              options={[
                { value: "", label: "Tout" },
                { value: "image", label: "Images" },
                { value: "analysis", label: "Analyses" },
                { value: "prompt", label: "Prompts" },
              ]}
            />
            <button className="chip" aria-pressed={favorite} onClick={() => setFavorite((f) => !f)} data-testid="filter-favorites">
              <Heart size={14} fill={favorite ? "currentColor" : "none"} /> Favoris
            </button>
            {meta.categories.length > 0 && (
              <select className="select" style={{ width: "auto" }} value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Catégorie">
                <option value="">Toutes les catégories</option>
                {meta.categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}
          </div>

          {selected.size > 0 && (
            <div className="selection-bar" data-testid="selection-bar">
              <strong className="small">{plural(selected.size, "sélectionné", "sélectionnés")}</strong>
              <button className="btn btn-sm" onClick={() => void downloadSelection([...selected])} data-testid="bulk-download">
                <Download size={14} /> Télécharger
              </button>
              <button className="btn btn-sm" onClick={() => void bulk({ favorite: true })}>
                <Heart size={14} /> Favoris
              </button>
              <select className="select" style={{ width: "auto", height: 32 }} value="" onChange={(e) => e.target.value && void bulk({ projectId: e.target.value === "none" ? null : e.target.value })} aria-label="Déplacer vers un projet">
                <option value="">Déplacer vers…</option>
                <option value="none">Sans projet</option>
                {meta.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button className="btn btn-sm btn-danger" onClick={() => setConfirmDelete([...selected])} data-testid="bulk-delete">
                <Trash size={14} /> Supprimer
              </button>
              <span className="grow" />
              <button className="btn btn-sm btn-ghost" onClick={() => setSelected(new Set(items.map((i) => i.id)))}>
                Tout sélectionner
              </button>
              <button className="btn btn-sm btn-ghost btn-icon" aria-label="Annuler la sélection" onClick={() => setSelected(new Set())}>
                <X size={15} />
              </button>
            </div>
          )}

          <div className="row-between" style={{ marginBottom: 12 }}>
            <span className="muted small" data-testid="library-count">
              {plural(total, "élément", "éléments")}
            </span>
            {loading && <Spinner />}
          </div>

          {!loading && items.length === 0 ? (
            <EmptyState icon={<Inbox size={24} />} title={debouncedQ || type || favorite || tag || projectId || category ? "Aucun résultat" : "Votre bibliothèque est vide"}>
              {debouncedQ || type || favorite || tag || projectId || category
                ? "Modifiez la recherche ou les filtres."
                : "Les images générées et analysées y sont enregistrées automatiquement. Vous pouvez aussi enregistrer vos prompts favoris."}
            </EmptyState>
          ) : (
            <div className="grid-cards" data-testid="library-grid">
              {items.map((it) => (
                <div key={it.id} className={cx("lib-card", selected.has(it.id) && "selected")} data-testid="library-card" onClick={() => setParams({ item: it.id })}>
                  <label className="lib-select" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(it.id)} onChange={() => toggle(it.id)} aria-label={`Sélectionner ${it.title}`} />
                  </label>
                  <div className="lib-badges">
                    {it.favorite && (
                      <span className="badge badge-danger" aria-label="Favori">
                        <Heart size={11} fill="currentColor" />
                      </span>
                    )}
                    <span className={cx("badge", it.type === "image" ? "badge-violet" : it.type === "analysis" ? "badge-blue" : "badge-success")}>{TYPE_LABEL[it.type]}</span>
                  </div>
                  {it.file ? (
                    <div className="lib-thumb">
                      <img src={fileUrl(it.file.name)} alt={it.title} loading="lazy" />
                    </div>
                  ) : (
                    <div className="lib-thumb text">
                      <span>{it.prompt}</span>
                    </div>
                  )}
                  <div className="image-meta">
                    <span className="title">{it.title || "Sans titre"}</span>
                    <span className="tiny muted">{formatDate(it.createdAt)}</span>
                    {it.tags.length > 0 && (
                      <div className="tag-list" style={{ marginTop: 4 }}>
                        {it.tags.slice(0, 3).map((t) => (
                          <span key={t} className="tag">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {items.length < total && (
            <button className="btn btn-block" style={{ marginTop: 16 }} onClick={() => void load(items.length)}>
              Charger plus
            </button>
          )}
        </section>
      </div>

      {detail && (
        <DetailDrawer
          key={detail.id}
          item={detail}
          projects={meta.projects}
          onClose={() => setParams({}, { replace: true })}
          onSaved={(it) => {
            setDetail(it);
            setItems((list) => list.map((x) => (x.id === it.id ? it : x)));
            void loadMeta();
          }}
          onDelete={() => setConfirmDelete([detail.id])}
          onReuse={() => reuse(detail)}
          onDownload={() => void downloadSelection([detail.id])}
          onOpenImage={() => {
            const i = images.findIndex((x) => x.id === detail.id);
            setLightbox(i >= 0 ? i : null);
          }}
          onUseAsReference={() => {
            if (!detail.file) return;
            const state: GenerateHandoff = { prompt: detail.prompt, negativePrompt: detail.negativePrompt, referenceItemId: detail.id, referenceFile: detail.file.name };
            navigate("/generer", { state });
          }}
          onOpenAnalysis={() => navigate(`/analyser?item=${detail.id}`)}
        />
      )}

      {lightbox !== null && images[lightbox] && <Lightbox items={images} index={lightbox} onIndex={setLightbox} onClose={() => setLightbox(null)} actions={{}} />}

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Supprimer définitivement ?"
        message={`${plural(confirmDelete?.length ?? 0, "élément sera supprimé", "éléments seront supprimés")} de la bibliothèque, avec leurs images. Cette action est irréversible (sauf si vous avez une sauvegarde).`}
        confirmLabel="Supprimer"
        danger
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && void doDelete(confirmDelete)}
      />
    </div>
  );
}

function InlineInput({ initial, placeholder, onSubmit, onCancel }: { initial: string; placeholder?: string; onSubmit: (v: string) => void; onCancel: () => void }) {
  const [v, setV] = useState(initial);
  return (
    <form
      className="row"
      style={{ flexWrap: "nowrap", gap: 4, padding: "4px 2px" }}
      onSubmit={(e) => {
        e.preventDefault();
        if (v.trim()) onSubmit(v.trim());
      }}
    >
      <input className="input" style={{ height: 34 }} autoFocus value={v} placeholder={placeholder} maxLength={80} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Escape" && onCancel()} data-testid="project-name" />
      <button className="btn btn-sm btn-icon" type="submit" aria-label="Valider">
        <Check size={14} />
      </button>
    </form>
  );
}

function DetailDrawer({
  item,
  projects,
  onClose,
  onSaved,
  onDelete,
  onReuse,
  onDownload,
  onOpenImage,
  onUseAsReference,
  onOpenAnalysis,
}: {
  item: LibraryItem;
  projects: ProjectWithCount[];
  onClose: () => void;
  onSaved: (it: LibraryItem) => void;
  onDelete: () => void;
  onReuse: () => void;
  onDownload: () => void;
  onOpenImage: () => void;
  onUseAsReference: () => void;
  onOpenAnalysis: () => void;
}) {
  const { toastError, toast } = useStudio();
  const [title, setTitle] = useState(item.title);
  const [tags, setTags] = useState(item.tags);
  const [tagDraft, setTagDraft] = useState("");
  const [notes, setNotes] = useState(item.notes);
  const [category, setCategory] = useState(item.category);
  const [projectId, setProjectId] = useState(item.projectId ?? "");
  const [favorite, setFavorite] = useState(item.favorite);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const dirty =
    title !== item.title || notes !== item.notes || category !== item.category || (projectId || null) !== item.projectId || favorite !== item.favorite || tags.join("|") !== item.tags.join("|");

  async function save() {
    setSaving(true);
    try {
      const { item: updated } = await api.patchItem(item.id, { title, tags, notes, category, projectId: projectId || null, favorite });
      onSaved(updated);
      toast("success", "Modifications enregistrées.");
    } catch (err) {
      toastError(err);
    } finally {
      setSaving(false);
    }
  }

  const addTag = () => {
    const t = tagDraft.trim();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagDraft("");
  };

  return (
    <>
      <div className="overlay" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Détails de l’élément" data-testid="drawer">
        <div className="drawer-head">
          <span className="badge badge-violet">{TYPE_LABEL[item.type]}</span>
          <button className="btn btn-ghost btn-icon" aria-label="Fermer" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="drawer-body">
          {item.file && <img className="preview-img" style={{ maxHeight: 300, cursor: "zoom-in" }} src={fileUrl(item.file.name)} alt={item.title} onClick={onOpenImage} />}

          <div className="field">
            <label className="label" htmlFor="d-title">
              Titre
            </label>
            <input id="d-title" className="input" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} data-testid="detail-title" />
          </div>

          <div className="field">
            <div className="label">
              Prompt <CopyButton text={item.prompt} />
            </div>
            <p className="prompt-text small" style={{ maxHeight: 180, overflow: "auto" }}>
              {item.prompt || "—"}
            </p>
            {item.negativePrompt && <p className="hint">Négatif : {item.negativePrompt}</p>}
          </div>

          <div className="row">
            <button className="btn btn-sm btn-primary" onClick={onReuse} disabled={!item.prompt} data-testid="reuse-prompt">
              <Send size={14} /> Réutiliser le prompt
            </button>
            {item.file && (
              <a className="btn btn-sm" href={downloadUrl(item.file.name, item.title)} download>
                <Download size={14} /> Télécharger
              </a>
            )}
            {!item.file && (
              <button className="btn btn-sm" onClick={onDownload}>
                <Download size={14} /> Exporter
              </button>
            )}
            {item.file && item.type === "image" && (
              <button className="btn btn-sm" onClick={onUseAsReference}>
                <ImagePlus size={14} /> Comme référence
              </button>
            )}
            {item.type === "analysis" && (
              <button className="btn btn-sm" onClick={onOpenAnalysis}>
                <ScanSearch size={14} /> Voir l’analyse
              </button>
            )}
          </div>

          <div className="divider" />

          <label className="switch">
            <input type="checkbox" checked={favorite} onChange={(e) => setFavorite(e.target.checked)} data-testid="detail-favorite" />
            <span>Favori</span>
          </label>

          <div className="field">
            <label className="label" htmlFor="d-tags">
              Étiquettes
            </label>
            {tags.length > 0 && (
              <div className="tag-list">
                {tags.map((t) => (
                  <span key={t} className="tag">
                    {t}
                    <button aria-label={`Retirer ${t}`} onClick={() => setTags(tags.filter((x) => x !== t))}>
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <input
              id="d-tags"
              className="input"
              placeholder="Ajouter une étiquette puis Entrée"
              value={tagDraft}
              maxLength={40}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addTag();
                }
              }}
              onBlur={addTag}
              data-testid="detail-tag-input"
            />
          </div>

          <div className="grid-2">
            <div className="field">
              <label className="label" htmlFor="d-project">
                Projet
              </label>
              <select id="d-project" className="select" value={projectId} onChange={(e) => setProjectId(e.target.value)} data-testid="detail-project">
                <option value="">Sans projet</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor="d-category">
                Catégorie
              </label>
              <input id="d-category" className="input" value={category} maxLength={60} placeholder="Ex. : Portraits" onChange={(e) => setCategory(e.target.value)} />
            </div>
          </div>

          <div className="field">
            <label className="label" htmlFor="d-notes">
              Notes
            </label>
            <textarea id="d-notes" className="textarea" value={notes} maxLength={10000} onChange={(e) => setNotes(e.target.value)} placeholder="Vos remarques, idées, réglages à retenir…" data-testid="detail-notes" />
          </div>

          <div className="row-between">
            <button className="btn btn-danger btn-sm" onClick={onDelete} data-testid="detail-delete">
              <Trash size={14} /> Supprimer
            </button>
            <button className="btn btn-primary" disabled={!dirty || saving} onClick={() => void save()} data-testid="detail-save">
              {saving ? <Spinner /> : <Check size={16} />} Enregistrer
            </button>
          </div>

          <dl className="kv small">
            <dt>Créé le</dt>
            <dd>{formatDate(item.createdAt)}</dd>
            {item.file && (
              <>
                <dt>Dimensions</dt>
                <dd>
                  {item.file.width} × {item.file.height} px
                </dd>
              </>
            )}
            {item.generation && (
              <>
                <dt>Moteur</dt>
                <dd>
                  {item.generation.engineName} · {item.generation.model}
                </dd>
              </>
            )}
            {item.analysisMeta && (
              <>
                <dt>Analysé par</dt>
                <dd>
                  {item.analysisMeta.engineName} · {item.analysisMeta.model}
                </dd>
              </>
            )}
          </dl>
        </div>
      </aside>
    </>
  );
}
