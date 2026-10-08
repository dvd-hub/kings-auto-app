import { notFound } from "next/navigation";
import { EmptySection } from "@/components/empty-section";

const sections = ["production", "crm", "classics", "billing", "settings"] as const;

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!sections.some((item) => item === section)) notFound();
  return <EmptySection titleKey={section as typeof sections[number]} />;
}
