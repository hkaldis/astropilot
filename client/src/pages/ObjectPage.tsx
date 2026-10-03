import { ObjectView } from "@/features/object/ObjectView";

export default function ObjectPage({ id }: { id: string }) {
  return <ObjectView id={id} />;
}
