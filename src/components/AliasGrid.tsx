type AliasRow = { id: number; actor_id: number; alias: string };

type Props = {
  rows: AliasRow[];
};

export default function AliasGrid({ rows }: Props) {
  if (!rows.length) return <div className="muted">No aliases found.</div>;
  return (
    <div className="alias-grid">
      {rows.map((r) => (
        <span key={r.id} className="alias-pill">
          {r.alias}
        </span>
      ))}
    </div>
  );
}
