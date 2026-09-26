"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/dialog";
import { ProductForm } from "@/components/inventory/product-form";
import { useT } from "@/i18n/client";

export function ProductEdit({ product, suppliers }: { product: NonNullable<Parameters<typeof ProductForm>[0]["initial"]> & { id: string }; suppliers: { id: string; name: string }[] }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (<><Button onClick={() => setOpen(true)}><Pencil /> {t("common.edit")}</Button><Sheet open={open} onOpenChange={setOpen} title={t("common.edit")} wide><ProductForm id={product.id} initial={product} suppliers={suppliers} onDone={() => { setOpen(false); router.refresh(); }} /></Sheet></>);
}
