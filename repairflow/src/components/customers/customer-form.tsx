"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useT } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/menu";
import { createCustomerAction, updateCustomerAction } from "@/app/actions/customers";

const schema = z.object({
  firstName: z.string().trim().min(1, "Obligatoire").max(80),
  lastName: z.string().trim().min(1, "Obligatoire").max(80),
  company: z.string().max(120),
  email: z.string().max(160).refine((v) => v === "" || /.+@.+\..+/.test(v), "E-mail invalide"),
  phone: z.string().max(30),
  address: z.string().max(200),
  postalCode: z.string().max(12),
  city: z.string().max(80),
  notes: z.string().max(2000),
  tags: z.string(),
  segment: z.enum(["NEW", "LOYAL", "VIP"]),
  consentEmail: z.boolean(),
  consentSms: z.boolean(),
  consentWhatsapp: z.boolean(),
  consentMarketing: z.boolean(),
});
type Form = z.infer<typeof schema>;

export function CustomerForm({ initial, id, onDone }: { initial?: Partial<Form>; id?: string; onDone: (id: string) => void }) {
  const t = useT();
  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting, isDirty } } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { firstName: "", lastName: "", company: "", email: "", phone: "", address: "", postalCode: "", city: "", notes: "", tags: "", segment: "NEW", consentEmail: true, consentSms: true, consentWhatsapp: false, consentMarketing: false, ...initial } });
  const onSubmit = handleSubmit(async (v) => {
    const payload = { ...v, tags: v.tags.split(",").map((s) => s.trim()).filter(Boolean) };
    const r = id ? await updateCustomerAction(id, payload) : await createCustomerAction(payload);
    if (!r.ok) return toast.error(r.error);
    toast.success(t("common.save"));
    onDone(id ?? (r.data as { id: string }).id);
  });
  const sw = (name: "consentEmail" | "consentSms" | "consentWhatsapp" | "consentMarketing", label: string) => <label className="flex items-center justify-between gap-3 text-[13px]"><span>{label}</span><Switch checked={watch(name)} onCheckedChange={(v) => setValue(name, v, { shouldDirty: true })} /></label>;
  return (
    <form onSubmit={onSubmit} className="space-y-4" onKeyDown={(e) => { if (e.key === "Escape" && isDirty && !confirm(t("common.unsavedWarning"))) e.stopPropagation(); }}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Prénom" id="firstName" error={errors.firstName?.message}><Input id="firstName" aria-invalid={Boolean(errors.firstName)} {...register("firstName")} /></Field>
        <Field label="Nom" id="lastName" error={errors.lastName?.message}><Input id="lastName" aria-invalid={Boolean(errors.lastName)} {...register("lastName")} /></Field>
        <Field label="Téléphone" id="phone"><Input id="phone" type="tel" {...register("phone")} /></Field>
        <Field label="E-mail" id="email" error={errors.email?.message}><Input id="email" type="email" aria-invalid={Boolean(errors.email)} {...register("email")} /></Field>
        <Field label="Société" id="company" className="col-span-2"><Input id="company" {...register("company")} /></Field>
        <Field label="Adresse" id="address" className="col-span-2"><Input id="address" {...register("address")} /></Field>
        <Field label="Code postal" id="postalCode"><Input id="postalCode" {...register("postalCode")} /></Field>
        <Field label="Ville" id="city"><Input id="city" {...register("city")} /></Field>
        <Field label="Segment" id="segment"><Select id="segment" {...register("segment")}>{["NEW", "LOYAL", "VIP"].map((s) => <option key={s} value={s}>{t(`customers.segments.${s}` as never)}</option>)}</Select></Field>
        <Field label={t("customers.tags")} id="tags" hint="séparés par des virgules"><Input id="tags" {...register("tags")} /></Field>
        <Field label={t("common.notes")} id="notes" className="col-span-2"><Textarea id="notes" rows={3} {...register("notes")} /></Field>
      </div>
      <fieldset className="space-y-2 rounded-[var(--radius-md)] border border-border p-3"><legend className="px-1 text-[12px] font-medium text-muted">{t("customers.consents")}</legend>{sw("consentEmail", t("customers.consentEmail"))}{sw("consentSms", t("customers.consentSms"))}{sw("consentWhatsapp", t("customers.consentWhatsapp"))}<div className="border-t border-border pt-2">{sw("consentMarketing", t("customers.consentMarketing"))}</div><p className="text-[11.5px] text-subtle">{t("customers.transactionalHint")}</p></fieldset>
      <Button type="submit" variant="primary" className="w-full" loading={isSubmitting}>{t("common.save")}</Button>
    </form>
  );
}
