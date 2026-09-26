"use client";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/states";

/** Recharts n'est chargé qu'une fois la page affichée : le tableau de bord reste réactif sur mobile. */
export const RevenueChart = dynamic(() => import("./revenue-chart").then((m) => m.RevenueChart), { ssr: false, loading: () => <Skeleton className="h-[240px]" /> });
