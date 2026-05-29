import { useMemo, useState } from "react";

type Actor = {
  source?: string | null;
  type?: string | null;
  operational_model?: string | null;
  victims?: string[];
  last_victim?: string | null;
  last_victim_date?: string | null;
  first_victim_date?: string | null;
  motivation?: string[];
  top_sectors?: string[];
  top_countries?: string[];
  assessment?: string | null;
  aliases?: Array<string | { alias?: string | null }>;
};

type Props = {
  actor: Actor;
  onSave: (payload: any) => void;
  profileCitations?: Record<string, { citation: number; url: string }[]>;
};

const listToText = (value?: Array<string | { alias?: string | null }>) => {
  if (!value || value.length === 0) return "";
  return value
    .map((item) => (typeof item === "string" ? item : item.alias || ""))
    .map((item) => item.trim())
    .filter(Boolean)
    .join(", ");
};

const splitList = (value: string) =>
  value
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);

export default function ActorProfileForm({ actor, onSave, profileCitations = {} }: Props) {
  const [assessment, setAssessment] = useState((actor.assessment || "no").toLowerCase() === "yes" ? "yes" : "no");
  const [source, setSource] = useState(actor.source || "");
  const [type, setType] = useState(actor.type || "");
  const [operationalModel, setOperationalModel] = useState(actor.operational_model || "");
  const [victims, setVictims] = useState(listToText(actor.victims as any));
  const [lastVictim, setLastVictim] = useState(actor.last_victim || "");
  const [lastVictimDate, setLastVictimDate] = useState(actor.last_victim_date || "");
  const [firstVictimDate, setFirstVictimDate] = useState(actor.first_victim_date || "");
  const [motivation, setMotivation] = useState(listToText(actor.motivation));
  const [topSectors, setTopSectors] = useState(listToText(actor.top_sectors));
  const [topCountries, setTopCountries] = useState(listToText(actor.top_countries));
  const [aliases, setAliases] = useState(listToText(actor.aliases));

  const payload = useMemo(
    () => ({
      assessment,
      source,
      type,
      operational_model: operationalModel,
      victims: splitList(victims),
      last_victim: lastVictim,
      last_victim_date: lastVictimDate,
      first_victim_date: firstVictimDate,
      motivation: splitList(motivation),
      top_sectors: splitList(topSectors),
      top_countries: splitList(topCountries),
      aliases: aliases.split(",").map((x) => x.trim()).filter(Boolean),
    }),
    [
      assessment,
      source,
      type,
      operationalModel,
      victims,
      lastVictim,
      lastVictimDate,
      firstVictimDate,
      motivation,
      topSectors,
      topCountries,
      aliases,
    ]
  );

  const renderTextField = (
    key: string,
    label: string,
    value: string,
    onChange: (value: string) => void
  ) => (
    <label className="form-field">
      <div className="snapshot-label">{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <input className="input" style={{ flex: 1 }} value={value} onChange={(e) => onChange(e.target.value)} />
        {value.trim() && profileCitations[key]?.length ? (
          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", justifyContent: "flex-end" }}>
            {profileCitations[key].map((item) => (
              <a
                key={`${key}-${item.citation}-${item.url}`}
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="citation-badge citation-inline citation-end"
              >
                [{item.citation}]
              </a>
            ))}
          </div>
        ) : null}
      </div>
    </label>
  );

  return (
    <div className="card" style={{ marginBottom: "16px" }}>
      <h3 className="section-title">Edit Profile</h3>
      <div style={{ display: "grid", gap: "12px", width: "100%" }}>
        {renderTextField("source", "Source", source, setSource)}
        {renderTextField("type", "Type", type, setType)}
        {renderTextField("operational_model", "Operational Model", operationalModel, setOperationalModel)}
        {renderTextField("victims", "Victims", victims, setVictims)}
        {renderTextField("last_victim", "Last Victim", lastVictim, setLastVictim)}
        {renderTextField("last_victim_date", "Last Victim Date", lastVictimDate, setLastVictimDate)}
        {renderTextField("first_victim_date", "First Victim Date", firstVictimDate, setFirstVictimDate)}
        {renderTextField("motivation", "Motivation", motivation, setMotivation)}
        {renderTextField("top_sectors", "Top Sectors", topSectors, setTopSectors)}
        {renderTextField("top_countries", "Top Countries", topCountries, setTopCountries)}
        {renderTextField("aliases", "Aliases", aliases, setAliases)}
        <div className="form-field">
          <div className="snapshot-label">Assessment</div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              className={`btn ${assessment === "yes" ? "btn-primary" : ""}`}
              onClick={() => setAssessment("yes")}
            >
              Yes
            </button>
            <button
              type="button"
              className={`btn ${assessment === "no" ? "btn-primary" : ""}`}
              onClick={() => setAssessment("no")}
            >
              No
            </button>
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => onSave(payload)}>Save Profile</button>
      </div>
    </div>
  );
}
