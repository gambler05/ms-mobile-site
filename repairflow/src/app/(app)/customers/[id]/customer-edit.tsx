"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/dialog";
import { CustomerForm } from "@/components/customers/customer-form";
import { useT } from "@/i18n/client";

export function CustomerEdit({ customer }: { customer: Parameters<typeof CustomerForm>[0]["initial"] & { id: string } }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}><Pencil /> {t("common.edit")}</Button>
      <Sheet open={open} onOpenChange={setOpen} title={t("common.edit")}><CustomerForm id={customer.id} initial={customer} onDone={() => { setOpen(false); router.refresh(); }} /></Sheet>
    </>
  );
}
