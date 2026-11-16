import { Compass } from "lucide-react";
import { Link } from "react-router-dom";
import { EmptyState } from "../components/ui";

export function NotFoundPage() {
  return (
    <div className="page">
      <EmptyState icon={<Compass size={24} />} title="Cette page n’existe pas">
        <Link to="/" className="btn btn-primary" style={{ marginTop: 8 }}>
          Retour au tableau de bord
        </Link>
      </EmptyState>
    </div>
  );
}
