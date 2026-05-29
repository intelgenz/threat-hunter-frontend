import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import client from "../api/client";
import ActorProfileForm from "../components/ActorProfileForm";
import AliasGrid from "../components/AliasGrid";
import { updateExecutionReview, updateTtpSelection } from "../api/malware";
import { useAppStore } from "../state/store";

type Actor = {
  id: number;
  name: string;
  status?: string;
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
  ttp_urls?: string[];
  execution_chain_urls?: string[];
  assessment?: string | null;
  assigned_to_user_id?: number | null;
  references?: ReferenceDoc[];
  aliases?: Array<string | { alias?: string | null }>;
};

type ActorLookupRow = {
  id: number;
  name: string;
  aliases?: string[];
};

type AliasRow = { id: number; actor_id: number; alias: string };
type WebIntelSection = {
  label: string;
  query: string;
  error?: string | null;
  results?: { title?: string; href?: string; body?: string }[];
};
type ReferenceDoc = {
  section?: string | null;
  title?: string | null;
  kind?: string | null;
  evidence?: string | null;
  url?: string | null;
  review_key?: string | null;
  review_status?: string | null;
  relation_is_related?: boolean | null;
  relation_text?: string | null;
  relation_status?: string | null;
  edited_title?: string | null;
  edited_kind?: string | null;
  edited_evidence?: string | null;
  edited_url?: string | null;
};
type ReferenceEntry = ReferenceDoc & {
  citation?: number;
};
type ExecutionItem = ReferenceEntry & {
  reviewKey: string;
  isPrimary: boolean;
  title: string;
  kind: string | null;
  evidence: string | null;
  url: string | null;
};
type CitationRef = {
  citation: number;
  url: string;
  title?: string | null;
  evidence?: string | null;
};
type AttackTechnique = {
  id: string;
  name: string;
  description?: string | null;
  platforms?: string[];
  is_subtechnique?: boolean;
  sub_technique_of?: string | null;
  source_refs?: CitationRef[];
  selection_origin?: "reference" | "manual";
  base_selected?: boolean;
  selected?: boolean;
  edit_status?: "selected" | "removed" | "available";
};
type AttackTactic = {
  tactic: string;
  tactic_id: string;
  techniques: AttackTechnique[];
};
type TtpEditorTactic = AttackTactic;
type UrlCitation = {
  url: string;
  citation: number;
};
const TTP_SECTION = "TTPs and URLs";
const EXEC_SECTION = "Execution Paths and URLs";
const ALL_URLS_SECTION = "All URLs";

const makeReviewKey = (ref: ReferenceDoc) =>
  [ref.section || "", ref.title || "", ref.kind || "", ref.evidence || "", ref.url || ""]
    .map((item) => item.trim())
    .join("||")
    .toLowerCase();

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getReferenceText = (ref: ReferenceEntry) =>
  [ref.title, ref.evidence, ref.url]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");

const buildProfileCitations = (actor: Actor | null, refs: ReferenceEntry[]) => {
  const matchRefs = (needle: string) => {
    const value = needle.trim();
    if (!value) return [];
    const pattern = new RegExp(`\\b${escapeRegExp(value)}\\b`, "i");
    const lowerValue = value.toLowerCase();
    return refs.filter((ref) => {
      const text = getReferenceText(ref);
      if (!text) return false;
      return pattern.test(text) || text.toLowerCase().includes(lowerValue);
    });
  };

  const listCitations = (items?: string[] | null) => {
    if (!items || items.length === 0) return [];
    const out: CitationRef[] = [];
    const seen = new Set<string>();
    for (const item of items) {
      for (const ref of matchRefs(item)) {
        if (!ref.citation || !ref.url) continue;
        const key = `${ref.citation}::${ref.url}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ citation: ref.citation, url: ref.url });
      }
    }
    return out;
  };

  return {
    source: listCitations(actor?.source ? [actor.source] : []),
    type: listCitations(actor?.type ? [actor.type] : []),
    operational_model: listCitations(actor?.operational_model ? [actor.operational_model] : []),
    victims: listCitations(actor?.victims),
    last_victim: listCitations(actor?.last_victim ? [actor.last_victim] : []),
    last_victim_date: listCitations(actor?.last_victim_date ? [actor.last_victim_date] : []),
    first_victim_date: listCitations(actor?.first_victim_date ? [actor.first_victim_date] : []),
    motivation: listCitations(actor?.motivation),
    top_sectors: listCitations(actor?.top_sectors),
    top_countries: listCitations(actor?.top_countries),
    aliases: listCitations(actor?.aliases?.map((item) => (typeof item === "string" ? item : item.alias || "")).filter(Boolean) || []),
  } as Record<string, CitationRef[]>;
};

const matchesActorName = (actor: Actor | null, ref: ReferenceDoc) => {
  const actorName = actor?.name?.trim().toLowerCase();
  if (!actorName) return false;
  const title = (ref.title || "").trim().toLowerCase();
  if (!title) return false;
  const actorPattern = new RegExp(`\\b${escapeRegExp(actorName)}\\b`, "i");
  return actorPattern.test(title);
};

const findActorMentions = (text: string, actors: ActorLookupRow[], currentActorId: number) => {
  const body = text.trim();
  if (!body) return [];
  const matches: ActorLookupRow[] = [];
  const seen = new Set<number>();
  const orderedActors = [...actors].sort((a, b) => b.name.length - a.name.length);
  for (const candidate of orderedActors) {
    if (candidate.id === currentActorId || seen.has(candidate.id)) continue;
    const names = [candidate.name, ...(candidate.aliases || [])]
      .map((value) => value.trim())
      .filter(Boolean);
    const matched = names.some((name) => new RegExp(`\\b${escapeRegExp(name)}\\b`, "i").test(body));
    if (matched) {
      seen.add(candidate.id);
      matches.push(candidate);
    }
  }
  return matches;
};

const renderPills = (items?: string[] | null, emptyLabel = "None listed") => {
  if (!items || items.length === 0) {
    return <span className="pill pill-muted">{emptyLabel}</span>;
  }
  return items.map((item) => <span key={item} className="pill">{item}</span>);
};

const normalizeReferenceSection = (section?: string | null) => {
  const text = section?.trim();
  return text && text.length > 0 ? text : "References";
};

const formatReferenceUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    const path = `${parsed.pathname}${parsed.search}${parsed.hash}`.replace(/\/$/, "");
    return `${parsed.hostname}${path}`;
  } catch {
    return url.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  }
};

export default function Detail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const actorId = Number(id);
  const [actor, setActor] = useState<Actor | null>(null);
  const [aliases, setAliases] = useState<AliasRow[]>([]);
  const [actorDirectory, setActorDirectory] = useState<ActorLookupRow[]>([]);
  const [activeTab, setActiveTab] = useState<"profile" | "web" | "evidence" | "ttps" | "execution" | "refs">("profile");
  const [webIntel, setWebIntel] = useState<WebIntelSection[] | null>(null);
  const [webLoading, setWebLoading] = useState(false);
  const [webIntelCache, setWebIntelCache] = useState<Record<number, WebIntelSection[]>>({});
  const [ttpMatrix, setTtpMatrix] = useState<AttackTactic[] | null>(null);
  const [ttpEditor, setTtpEditor] = useState<TtpEditorTactic[] | null>(null);
  const [ttpLoading, setTtpLoading] = useState(false);
  const [ttpEditorLoading, setTtpEditorLoading] = useState(false);
  const [ttpSaving, setTtpSaving] = useState(false);
  const [ttpMatrixScale, setTtpMatrixScale] = useState(0.9);
  const [ttpEditing, setTtpEditing] = useState(false);
  const [ttpFilter, setTtpFilter] = useState("");
  const [ttpSelectionDraft, setTtpSelectionDraft] = useState<string[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [editDrafts, setEditDrafts] = useState<
    Record<
      string,
      {
        title: string;
        kind: string;
        evidence: string;
        url: string;
        relationText: string;
        relationIsRelated: boolean | null;
      }
    >
  >({});
  const showToast = useAppStore((s) => s.showToast);
  const authUser = useAppStore((s) => s.authUser);

  const quickStats = useMemo(() => {
    if (!actor) {
      return { aliases: 0, sectors: 0, countries: 0, refs: 0 };
    }
    return {
      aliases: aliases.length,
      sectors: actor.top_sectors?.length ?? 0,
      countries: actor.top_countries?.length ?? 0,
      refs: actor.references?.length ?? 0,
    };
  }, [actor, aliases.length]);

  const referenceData = useMemo(() => {
    const refs = actor?.references || [];
    const citationMap = new Map<string, number>();
    const referenceUrls: UrlCitation[] = [];
    const evidenceGroups = new Map<string, ReferenceEntry[]>();
    const ttpGroup: ReferenceEntry[] = [];
    const executionGroup: ReferenceEntry[] = [];
    let nextCitation = 1;

    const getCitation = (url?: string | null) => {
      const key = url?.trim();
      if (!key) {
        return undefined;
      }
      if (!citationMap.has(key)) {
        citationMap.set(key, nextCitation);
        nextCitation += 1;
      }
      return citationMap.get(key);
    };

    refs.forEach((ref) => {
      const citation = getCitation(ref.url);
      const section = normalizeReferenceSection(ref.section);
      const current = evidenceGroups.get(section) || [];
      const entry: ReferenceEntry = { ...ref, citation };
      const isDuplicate = current.some((item) => item.url === ref.url && item.evidence === ref.evidence);
      if (!isDuplicate) {
        current.push(entry);
      }
      evidenceGroups.set(section, current);
      if (ref.url && citation && !referenceUrls.some((item) => item.url === ref.url)) {
        referenceUrls.push({ url: ref.url, citation });
      }

      if (section === TTP_SECTION) {
        const exists = ttpGroup.some((item) => item.url === ref.url && item.evidence === ref.evidence);
        if (!exists) ttpGroup.push(entry);
      }
      if (section === EXEC_SECTION) {
        const exists = executionGroup.some((item) => item.url === ref.url && item.evidence === ref.evidence);
        if (!exists) executionGroup.push(entry);
      }
    });

    const dedupe = (items: ReferenceEntry[]) => {
      const seen = new Set<string>();
      return items.filter((item) => {
        const key = [item.section || "", item.title || "", item.kind || "", item.url || "", item.evidence || ""].join("||");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };

    return {
      evidenceGroups: Array.from(evidenceGroups.entries()).map(([section, items]) => ({ section, items: dedupe(items) })),
      referenceUrls,
      ttpGroup: dedupe(ttpGroup),
      executionGroup: dedupe(executionGroup),
    };
  }, [actor?.references]);

  const executionItems = useMemo(() => {
    const refs = referenceData.executionGroup;
    return refs.map((ref) => {
      const reviewKey = ref.review_key || makeReviewKey(ref);
      const isPrimary = matchesActorName(actor, ref);
      return {
        ...ref,
        reviewKey,
        isPrimary,
        title: ref.edited_title || ref.title || "Untitled",
        kind: ref.edited_kind || ref.kind || null,
        evidence: ref.edited_evidence || ref.evidence || null,
        url: ref.edited_url || ref.url || null,
        citation: ref.citation,
      };
    });
  }, [actor, referenceData.executionGroup]);

  const profileCitations = useMemo(() => buildProfileCitations(actor, referenceData.evidenceGroups.flatMap((group) => group.items)), [
    actor,
    referenceData.evidenceGroups,
  ]);

  const ttpSelectionSet = useMemo(() => new Set(ttpSelectionDraft), [ttpSelectionDraft]);

  const filteredTtpEditor = useMemo(() => {
    if (!ttpEditor) return null;
    const query = ttpFilter.trim().toLowerCase();
    if (!query) return ttpEditor;
    return ttpEditor
      .map((group) => ({
        ...group,
        techniques: group.techniques.filter((technique) => {
          const text = `${technique.id} ${technique.name} ${technique.description || ""} ${(technique.platforms || []).join(" ")}`.toLowerCase();
          return text.includes(query);
        }),
      }))
      .filter((group) => group.techniques.length > 0);
  }, [ttpEditor, ttpFilter]);

  const getTtpStatus = (technique: AttackTechnique) => {
    const isSelected = ttpSelectionSet.has(technique.id);
    const isBaseSelected = Boolean(technique.base_selected);
    if (isSelected) return isBaseSelected ? "selected" : "added";
    if (isBaseSelected) return "removed";
    return "available";
  };

  const openTtpEditor = async () => {
    setTtpEditing(true);
    setTtpEditorLoading(true);
    try {
      const res = await client.get<TtpEditorTactic[]>(`/actors/${actorId}/ttp-editor`);
      const data = res.data || [];
      setTtpEditor(data);
      setTtpSelectionDraft(
        data.flatMap((group) => group.techniques.filter((technique) => technique.selected).map((technique) => technique.id))
      );
      setTtpFilter("");
    } catch {
      setTtpEditor([]);
      setTtpSelectionDraft([]);
      setTtpEditing(false);
      showToast("Failed to load TTP editor.", "error");
    } finally {
      setTtpEditorLoading(false);
    }
  };

  const cancelTtpEditor = () => {
    setTtpEditing(false);
    setTtpEditor(null);
    setTtpSelectionDraft([]);
    setTtpFilter("");
  };

  const toggleTtpTechnique = (techniqueId: string) => {
    setTtpSelectionDraft((current) => {
      const next = new Set(current);
      if (next.has(techniqueId)) {
        next.delete(techniqueId);
      } else {
        next.add(techniqueId);
      }
      return Array.from(next);
    });
  };

  const saveTtpSelection = async () => {
    setTtpSaving(true);
    try {
      await updateTtpSelection(actorId, ttpSelectionDraft);
      showToast("TTP selection saved.", "success");
      setTtpEditing(false);
      setTtpEditor(null);
      setTtpSelectionDraft([]);
      await loadTtpMatrix();
    } catch {
      showToast("Failed to save TTP selection.", "error");
    } finally {
      setTtpSaving(false);
    }
  };

  const renderExecutionCard = (ref: ExecutionItem) => {
    const draft = editDrafts[ref.reviewKey] || {
      title: ref.title || "",
      kind: ref.kind || "",
      evidence: ref.evidence || "",
      url: ref.url || "",
      relationText: ref.relation_text || "",
      relationIsRelated: ref.relation_is_related ?? null,
    };
    const isEditing = editingKey === ref.reviewKey;
    const statusLabel = ref.review_status || "pending";
    const relationText = isEditing ? draft.relationText : ref.relation_text || "";
    const matchedActors = ref.relation_is_related === true ? findActorMentions(relationText, actorDirectory, actorId) : [];
    return (
      <div key={ref.reviewKey} className="evidence-card">
        <div className="reference-block-head">
          <div className="reference-block-kind">{ref.isPrimary ? "Primary" : "Related"}</div>
          <div className="reference-block-title">{ref.title}</div>
          <div className="pill pill-muted">Review: {statusLabel}</div>
          {ref.citation && ref.url ? (
            <a href={ref.url} target="_blank" rel="noreferrer" className="citation-badge citation-inline citation-end">
              [{ref.citation}]
            </a>
          ) : null}
        </div>
        {isEditing ? (
          <div style={{ display: "grid", gap: "8px" }}>
            <input
              className="input"
              value={draft.title}
              onChange={(e) =>
                setEditDrafts((prev) => ({
                  ...prev,
                  [ref.reviewKey]: { ...draft, title: e.target.value },
                }))
              }
              placeholder="Title"
            />
            <input
              className="input"
              value={draft.kind}
              onChange={(e) =>
                setEditDrafts((prev) => ({
                  ...prev,
                  [ref.reviewKey]: { ...draft, kind: e.target.value },
                }))
              }
              placeholder="Kind"
            />
            <textarea
              className="input"
              value={draft.evidence}
              onChange={(e) =>
                setEditDrafts((prev) => ({
                  ...prev,
                  [ref.reviewKey]: { ...draft, evidence: e.target.value },
                }))
              }
              placeholder="Evidence"
              rows={5}
            />
            <input
              className="input"
              value={draft.url}
              onChange={(e) =>
                setEditDrafts((prev) => ({
                  ...prev,
                  [ref.reviewKey]: { ...draft, url: e.target.value },
                }))
              }
              placeholder="URL"
            />
          </div>
        ) : (
          <>
            {ref.kind ? <div className="reference-block-kind">{ref.kind}</div> : null}
            {ref.evidence ? <div className="reference-block-body">{ref.evidence}</div> : null}
          </>
        )}
        <div className="action-row" style={{ marginTop: 10 }}>
          <button
            className="btn"
            disabled={savingKey === ref.reviewKey}
            onClick={() =>
              handleExecutionReviewSave(ref.reviewKey, {
                review_status: "accepted",
                edited_title: isEditing ? draft.title : ref.title,
                edited_kind: isEditing ? draft.kind : ref.kind,
                edited_evidence: isEditing ? draft.evidence : ref.evidence,
                edited_url: isEditing ? draft.url : ref.url,
                relation_is_related: ref.relation_is_related,
                relation_text: ref.relation_text,
                relation_status: ref.relation_status,
              })
            }
          >
            Accept
          </button>
          <button
            className="btn"
            disabled={savingKey === ref.reviewKey}
            onClick={() =>
              handleExecutionReviewSave(ref.reviewKey, {
                review_status: "rejected",
                edited_title: isEditing ? draft.title : ref.title,
                edited_kind: isEditing ? draft.kind : ref.kind,
                edited_evidence: isEditing ? draft.evidence : ref.evidence,
                edited_url: isEditing ? draft.url : ref.url,
                relation_is_related: ref.relation_is_related,
                relation_text: ref.relation_text,
                relation_status: ref.relation_status,
              })
            }
          >
            Reject
          </button>
          {!isEditing ? (
            <button className="btn" onClick={() => startEditingExecution(ref)}>
              Edit
            </button>
          ) : (
            <button className="btn" onClick={() => cancelEditingExecution(ref.reviewKey)}>
              Cancel
            </button>
          )}
        </div>
        {!ref.isPrimary ? (
          <div className="card" style={{ marginTop: 12, padding: 12, background: "rgba(59,130,246,0.04)" }}>
            <div className="section-head">
              <div className="section-title" style={{ margin: 0 }}>Relation</div>
              <span className="muted">How is both of them related</span>
            </div>
            <div className="action-row" style={{ marginTop: 8 }}>
              <button
                className={`btn ${ref.relation_is_related === true ? "btn-primary" : ""}`}
                disabled={savingKey === ref.reviewKey}
                onClick={() =>
                  handleExecutionReviewSave(ref.reviewKey, {
                    relation_is_related: true,
                    relation_text: isEditing ? draft.relationText : ref.relation_text,
                  })
                }
              >
                Yes
              </button>
              <button
                className={`btn ${ref.relation_is_related === false ? "btn-primary" : ""}`}
                disabled={savingKey === ref.reviewKey}
                onClick={() =>
                  handleExecutionReviewSave(ref.reviewKey, {
                    relation_is_related: false,
                    relation_text: null,
                  })
                }
              >
                No
              </button>
            </div>
            {ref.relation_is_related === true ? (
              <div style={{ display: "grid", gap: "10px", marginTop: "10px" }}>
                <label className="form-field">
                  <div className="snapshot-label">How is both of them related</div>
                  <textarea
                    className="input"
                    rows={3}
                    value={relationText}
                    onChange={(e) =>
                      setEditDrafts((prev) => ({
                        ...prev,
                        [ref.reviewKey]: { ...draft, relationText: e.target.value },
                      }))
                    }
                    placeholder="Describe the relationship"
                  />
                </label>
                {matchedActors.length > 0 ? (
                  <div style={{ display: "grid", gap: "8px" }}>
                    <div className="snapshot-label">Threat actors mentioned in relation</div>
                    {matchedActors.map((match) => (
                      <div
                        key={match.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "12px",
                          border: "1px solid var(--border)",
                          borderRadius: "10px",
                          padding: "10px 12px",
                          background: "rgba(249, 115, 22, 0.04)",
                        }}
                      >
                        <div className="reference-block-title" style={{ margin: 0 }}>
                          {match.name}
                        </div>
                        <button className="btn-glass btn-glass-orange" onClick={() => navigate(`/actors/${match.id}`)}>
                          Open
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="action-row" style={{ marginTop: 8 }}>
              <span className="pill pill-muted">
                Relation: {ref.relation_is_related === true ? "Yes" : ref.relation_is_related === false ? "No" : "Pending"}
              </span>
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  const loadActor = async () => {
    const res = await client.get(`/actors/${actorId}`);
    setActor(res.data);
    const aliasRes = await client.get(`/actors/${actorId}/aliases`);
    setAliases(aliasRes.data || []);
    try {
      const directoryRes = await client.get<ActorLookupRow[]>("/actors");
      setActorDirectory(directoryRes.data || []);
    } catch {
      setActorDirectory([]);
    }
  };

  useEffect(() => {
    if (!actorId) return;
    loadActor();
  }, [actorId]);

  const handleProfileSave = async (payload: any) => {
    try {
      await client.post(`/actors/${actorId}/profile`, payload);
      showToast("Profile saved.", "success");
      await loadActor();
    } catch {
      showToast("Failed to save profile.", "error");
    }
  };

  const handleExecutionReviewSave = async (
    reviewKey: string,
    payload: {
      review_status?: string | null;
      relation_is_related?: boolean | null;
      relation_text?: string | null;
      relation_status?: string | null;
      edited_title?: string | null;
      edited_kind?: string | null;
      edited_evidence?: string | null;
      edited_url?: string | null;
    }
  ) => {
    setSavingKey(reviewKey);
    try {
      await updateExecutionReview(actorId, { review_key: reviewKey, ...payload });
      await loadActor();
      showToast("Execution review saved.", "success");
      setEditingKey(null);
    } catch {
      showToast("Failed to save execution review.", "error");
    } finally {
      setSavingKey(null);
    }
  };

  const startEditingExecution = (ref: any) => {
    const reviewKey = ref.reviewKey;
    setEditingKey(reviewKey);
    setEditDrafts((prev) => ({
      ...prev,
      [reviewKey]: {
        title: ref.title || "",
        kind: ref.kind || "",
        evidence: ref.evidence || "",
        url: ref.url || "",
        relationText: ref.relation_text || "",
        relationIsRelated: ref.relation_is_related ?? null,
      },
    }));
  };

  const cancelEditingExecution = (reviewKey: string) => {
    setEditingKey((current) => (current === reviewKey ? null : current));
  };

  const handleFetchWebIntel = async () => {
    if (webIntelCache[actorId]) {
      setWebIntel(webIntelCache[actorId]);
      showToast("Loaded cached web intelligence.", "success");
      return;
    }
    setWebLoading(true);
    try {
      const res = await client.get(`/actors/${actorId}/web-intel`, { params: { max_results: 5 } });
      const data = res.data || [];
      setWebIntel(data);
      setWebIntelCache((prev) => ({ ...prev, [actorId]: data }));
      showToast("Web intelligence fetched.", "success");
    } catch {
      showToast("Failed to fetch web intelligence.", "error");
    } finally {
      setWebLoading(false);
    }
  };

  const handleRefreshWebIntel = async () => {
    setWebLoading(true);
    try {
      const res = await client.get(`/actors/${actorId}/web-intel`, { params: { max_results: 5 } });
      const data = res.data || [];
      setWebIntel(data);
      setWebIntelCache((prev) => ({ ...prev, [actorId]: data }));
      showToast("Web intelligence refreshed.", "success");
    } catch {
      showToast("Failed to refresh web intelligence.", "error");
    } finally {
      setWebLoading(false);
    }
  };

  const loadTtpMatrix = async () => {
    setTtpLoading(true);
    try {
      const res = await client.get<AttackTactic[]>(`/actors/${actorId}/ttp-matrix`);
      setTtpMatrix(res.data || []);
    } catch {
      setTtpMatrix([]);
    } finally {
      setTtpLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== "web") return;
    if (webIntel || webLoading) return;
    handleFetchWebIntel();
  }, [activeTab, webIntel, webLoading]);

  useEffect(() => {
    if (activeTab !== "ttps") return;
    if (ttpMatrix || ttpLoading) return;
    loadTtpMatrix();
  }, [activeTab, ttpMatrix, ttpLoading]);

  if (!actor) return <div style={{ padding: "16px" }}>Loading...</div>;

  return (
    <div className="main detail-page">
      <div className="page-header">
        <button className="btn btn-ghost" onClick={() => navigate(-1)}>Back</button>
        <div className="header-left">
          <div className="eyebrow">Threat Actor Record</div>
          <h2 className="page-title">{actor.name}</h2>
          <div className="meta-row">
            <span className="pill">Source: {actor.source || "Unknown"}</span>
            <span className="pill">Type: {actor.type || "Unknown"}</span>
            <span className="pill">Operational Model: {actor.operational_model || "Unknown"}</span>
            {authUser?.role === "admin" && actor.assigned_to_user_id ? (
              <span className="pill">Assigned: User {actor.assigned_to_user_id}</span>
            ) : (
              authUser?.role === "admin" ? <span className="pill pill-muted">Unassigned</span> : null
            )}
          </div>
        </div>
        <div className="header-actions">
          <div className="stat-card">
            <div className="stat-value">{quickStats.aliases}</div>
            <div className="stat-label">Aliases</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{quickStats.refs}</div>
            <div className="stat-label">References</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{actor.assessment ? "Set" : "None"}</div>
            <div className="stat-label">Assessment</div>
          </div>
        </div>
      </div>

      <div className="card hero-card">
        <div className="section-head">
          <h3 className="section-title">Excel Snapshot</h3>
          <span className="muted">Fields imported from the spreadsheet</span>
        </div>
        <div className="snapshot-grid">
          <div>
            <div className="snapshot-label">Top Countries</div>
            <div className="pill-row">{renderPills(actor.top_countries, "No countries tagged")}</div>
          </div>
          <div>
            <div className="snapshot-label">Top Sectors</div>
            <div className="pill-row">{renderPills(actor.top_sectors, "No sectors tagged")}</div>
          </div>
          <div>
            <div className="snapshot-label">Victims</div>
            <div className="pill-row">{renderPills(actor.victims, "No victims tagged")}</div>
          </div>
        </div>
        <div className="section-head" style={{ marginTop: "16px" }}>
          <h3 className="section-title">Alias Library</h3>
          <span className="muted">Known naming variations</span>
        </div>
        <AliasGrid rows={aliases} />
      </div>

      <div className="tab-bar">
        <button className={`tab ${activeTab === "profile" ? "active" : ""}`} onClick={() => setActiveTab("profile")}>
          Profile
        </button>
        <button className={`tab ${activeTab === "evidence" ? "active" : ""}`} onClick={() => setActiveTab("evidence")}>
          Evidence
        </button>
        <button className={`tab ${activeTab === "ttps" ? "active" : ""}`} onClick={() => setActiveTab("ttps")}>
          TTPs
        </button>
        <button className={`tab ${activeTab === "execution" ? "active" : ""}`} onClick={() => setActiveTab("execution")}>
          Execution Path
        </button>
        <button className={`tab ${activeTab === "web" ? "active" : ""}`} onClick={() => setActiveTab("web")}>
          Web Intelligence
        </button>
        <button className={`tab ${activeTab === "refs" ? "active" : ""}`} onClick={() => setActiveTab("refs")}>
          References
        </button>
      </div>

      {activeTab === "profile" ? (
        <div className="detail-grid single">
          <div className="detail-main">
            <div className="card">
              <div className="section-head">
                <h3 className="section-title">Actor Profile</h3>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <span className="muted">Edit the imported spreadsheet fields</span>
                  <span className="pill">Assessment: {actor.assessment || "None listed"}</span>
                </div>
              </div>
              <ActorProfileForm actor={actor} onSave={handleProfileSave} profileCitations={profileCitations} />
            </div>
          </div>
        </div>
      ) : activeTab === "web" ? (
        <div className="detail-grid single">
          <div className="card">
            <div className="section-head">
              <h3 className="section-title">Web Intelligence</h3>
              <span className="muted">Pull open-source mentions for analyst review</span>
            </div>
            <div className="action-row">
              <button className="btn btn-primary" onClick={handleFetchWebIntel} disabled={webLoading}>
                {webLoading ? "Fetching..." : "Fetch Web Intelligence"}
              </button>
              <button onClick={handleRefreshWebIntel} disabled={webLoading} className="btn">
                Refresh
              </button>
            </div>
            {!webIntel && <div className="muted">No web intelligence fetched yet.</div>}
            {webIntel && webIntel.length === 0 && <div className="muted">No results.</div>}
            {webIntel && webIntel.length > 0 && (
              <div className="webintel-list" style={{ width: "100%", display: "flex", flexDirection: "column", gap: "14px" }}>
                {webIntel.map((sec, idx) => (
                  <div key={`${sec.label}-${idx}`} className="webintel-card" style={{ width: "100%", minWidth: 0 }}>
                    <div className="webintel-head">
                      <h4 className="section-title">{sec.label}</h4>
                      <div className="webintel-query">Query: {sec.query}</div>
                    </div>
                    {sec.error && <div className="error-text">{sec.error}</div>}
                    {!sec.error && (!sec.results || sec.results.length === 0) && (
                      <div className="muted">No results.</div>
                    )}
                    {!sec.error && sec.results && sec.results.length > 0 && (
                      <ul className="result-list">
                        {sec.results.map((item, i) => (
                          <li key={`${sec.label}-${i}`} className="result-item">
                            {item.href ? (
                              <a href={item.href} target="_blank" rel="noreferrer">
                                {item.title || item.href}
                              </a>
                            ) : (
                              <span>{item.title || `Result ${i + 1}`}</span>
                            )}
                            {item.body ? <div className="result-snippet">{item.body}</div> : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : activeTab === "ttps" ? (
        <div className="detail-grid single">
          <div className="card">
            <div className="section-head">
              <div>
                <h3 className="section-title">TTPs</h3>
                <span className="muted">
                  {ttpEditing ? "Edit mode. Green = selected, red = removed, gray = available." : "Technique matrix based on ATT&CK v19 cache"}
                </span>
              </div>
              <div className="action-row">
                {ttpEditing ? (
                  <>
                    <button className="btn" onClick={cancelTtpEditor} disabled={ttpSaving || ttpEditorLoading}>
                      Cancel
                    </button>
                    <button className="btn btn-primary" onClick={saveTtpSelection} disabled={ttpSaving || ttpEditorLoading}>
                      {ttpSaving ? "Saving..." : "Save TTPs"}
                    </button>
                  </>
                ) : (
                  <button className="btn btn-primary" onClick={openTtpEditor} disabled={ttpLoading}>
                    Edit TTPs
                  </button>
                )}
              </div>
            </div>
            {ttpEditing ? (
              ttpEditorLoading ? (
                <div className="muted">Loading TTP editor...</div>
              ) : filteredTtpEditor && filteredTtpEditor.length > 0 ? (
                <div
                  className="technique-matrix-shell ttp-matrix-shell ttp-editor-shell"
                  style={{ ["--matrix-scale" as string]: ttpMatrixScale.toString() }}
                >
                  <div className="matrix-controls ttp-matrix-controls">
                    <div className="matrix-volume">
                      <input
                        type="range"
                        min="70"
                        max="120"
                        step="10"
                        value={Math.round(ttpMatrixScale * 100)}
                        onChange={(event) => setTtpMatrixScale(Number(event.target.value) / 100)}
                        aria-label="Matrix size"
                        className="matrix-volume-slider"
                      />
                      <span className="section-note">Matrix size</span>
                    </div>
                    <div className="ttp-legend">
                      <span className="pill ttp-status-pill ttp-status-pill-selected">Selected</span>
                      <span className="pill ttp-status-pill ttp-status-pill-removed">Removed</span>
                      <span className="pill ttp-status-pill ttp-status-pill-available">Available</span>
                    </div>
                    <label className="matrix-volume ttp-filter-row">
                      <input
                        className="input"
                        value={ttpFilter}
                        onChange={(event) => setTtpFilter(event.target.value)}
                        placeholder="Filter techniques"
                      />
                    </label>
                  </div>
                  <div className="technique-matrix">
                    {filteredTtpEditor.map((group) => (
                      <details key={group.tactic_id || group.tactic} className="ttp-matrix-column" open={true}>
                        <summary
                          className="ttp-matrix-head"
                          title={`${group.tactic_id} - ${group.tactic}`}
                          aria-label={`${group.tactic_id} ${group.tactic}`}
                        >
                          <span className="ttp-matrix-chevron" aria-hidden="true">{">"}</span>
                          <span className="tactic-id">{group.tactic_id}</span>
                          <h5>{group.tactic}</h5>
                          <span className="tactic-count">{group.techniques.length} techniques</span>
                        </summary>
                        <div className="ttp-matrix-entries">
                          {group.techniques.map((technique, idx) => {
                            const status = getTtpStatus(technique);
                            return (
                              <div
                                key={technique.id}
                                className={`ttp-edit-card ttp-edit-card-${status} ttp-matrix-node-tone-${((technique.id.charCodeAt(0) || idx) + technique.id.length + idx) % 4}`}
                                role="button"
                                tabIndex={0}
                                onClick={() => toggleTtpTechnique(technique.id)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    toggleTtpTechnique(technique.id);
                                  }
                                }}
                                title="Click to toggle selection"
                              >
                                <div className="ttp-edit-card-head">
                                  <div>
                                    <strong>{technique.id}</strong>
                                    <h5>{technique.name}</h5>
                                  </div>
                                  <span className={`ttp-status-pill ttp-status-pill-${status}`}>
                                    {status === "selected" ? "Selected" : status === "removed" ? "Removed" : "Available"}
                                  </span>
                                </div>
                                <div className="ttp-edit-card-body">
                                  {technique.sub_technique_of ? <span className="technique-family-tag">Parent: {technique.sub_technique_of}</span> : null}
                                  {technique.source_refs && technique.source_refs.length > 0 ? (
                                    <div className="ttp-edit-source-list">
                                      {technique.source_refs.map((source) => (
                                        <a
                                          key={`${technique.id}-${source.citation}-${source.url}`}
                                          href={source.url}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="citation-badge citation-inline"
                                          onClick={(event) => event.stopPropagation()}
                                        >
                                          [{source.citation}]
                                        </a>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="muted">No matched sources.</div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </details>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="muted">No techniques available.</div>
              )
            ) : ttpLoading ? (
              <div className="muted">Loading technique matrix...</div>
            ) : ttpMatrix && ttpMatrix.length > 0 ? (
              <div
                className="technique-matrix-shell ttp-matrix-shell"
                style={{ ["--matrix-scale" as string]: ttpMatrixScale.toString() }}
              >
                <div className="matrix-controls ttp-matrix-controls">
                  <div className="matrix-volume">
                    <input
                      type="range"
                      min="70"
                      max="120"
                      step="10"
                      value={Math.round(ttpMatrixScale * 100)}
                      onChange={(event) => setTtpMatrixScale(Number(event.target.value) / 100)}
                      aria-label="Matrix size"
                      className="matrix-volume-slider"
                    />
                    <span className="section-note">Matrix size</span>
                  </div>
                </div>
                <div className="technique-matrix">
                  {ttpMatrix.map((group) => (
                    <details key={group.tactic_id || group.tactic} className="ttp-matrix-column" open={false}>
                      <summary
                        className="ttp-matrix-head"
                        title={`${group.tactic_id} - ${group.tactic}`}
                        aria-label={`${group.tactic_id} ${group.tactic}`}
                      >
                        <span className="ttp-matrix-chevron" aria-hidden="true">{">"}</span>
                        <span className="tactic-id">{group.tactic_id}</span>
                        <h5>{group.tactic}</h5>
                        <span className="tactic-count">{group.techniques.length} techniques</span>
                      </summary>
                      <div className="ttp-matrix-entries">
                        {group.techniques.map((technique, idx) => (
                          <details
                            key={technique.id}
                            className={`ttp-matrix-node ttp-matrix-node-tone-${((technique.id.charCodeAt(0) || idx) + technique.id.length + idx) % 4}`}
                            open={false}
                          >
                            <summary className="ttp-matrix-node-head">
                              <strong>{technique.id}</strong>
                              <span>{technique.name}</span>
                              {technique.sub_technique_of ? <span className="technique-family-tag">Parent: {technique.sub_technique_of}</span> : null}
                            </summary>
                            <div className="ttp-matrix-node-body">
                              {technique.selection_origin === "manual" ? <span className="pill pill-muted">Manual</span> : null}
                              {technique.source_refs && technique.source_refs.length > 0 ? (
                                <div className="ttp-source-list">
                                  {technique.source_refs.map((source) => (
                                    <a
                                      key={`${technique.id}-${source.citation}-${source.url}`}
                                      href={source.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="citation-badge citation-inline"
                                    >
                                      [{source.citation}]
                                    </a>
                                  ))}
                                </div>
                              ) : null}
                              {technique.source_refs && technique.source_refs.length > 0 ? (
                                <div className="ttp-technique-sources">
                                  {technique.source_refs.map((source) => (
                                    <a
                                      key={`${technique.id}-link-${source.citation}-${source.url}`}
                                      href={source.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="reference-link"
                                    >
                                      {source.title || source.url}
                                    </a>
                                  ))}
                                </div>
                              ) : (
                                <div className="muted">No matched sources.</div>
                              )}
                            </div>
                          </details>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            ) : (
              <div className="muted">No ATT&CK techniques matched.</div>
            )}
          </div>
        </div>
      ) : activeTab === "execution" ? (
        <div className="detail-grid single">
          <div className="card">
            <div className="section-head">
              <h3 className="section-title">Execution Path</h3>
              <span className="muted">Primary actor chain first, related chains after review</span>
            </div>
            {executionItems.length > 0 ? (
              <div className="evidence-cards">
                <div className="reference-section reference-subsection">
                  <div className="reference-name">Execution Chains</div>
                  <div className="evidence-cards">
                    {executionItems.filter((item) => item.isPrimary).map((ref) => renderExecutionCard(ref))}
                  </div>
                </div>
                <div className="reference-section reference-subsection">
                  <div className="reference-name">Related Execution Chains</div>
                  <div className="evidence-cards">
                    {executionItems.filter((item) => !item.isPrimary).map((ref) => renderExecutionCard(ref))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="muted">No execution path entries.</div>
            )}
          </div>
        </div>
      ) : activeTab === "refs" ? (
        <div className="detail-grid single">
          <div className="card">
            <div className="section-head">
              <h3 className="section-title">References</h3>
              <span className="muted">Citation list from All URLs</span>
            </div>
            {referenceData.referenceUrls.length > 0 ? (
              <div className="reference-citation-list">
                {referenceData.referenceUrls.map((ref) => (
                  <div key={`${ref.citation}-${ref.url}`} className="reference-card reference-card-compact">
                    <a href={ref.url} target="_blank" rel="noreferrer" className="reference-link">
                      {formatReferenceUrl(ref.url)}
                    </a>
                    <a href={ref.url} target="_blank" rel="noreferrer" className="citation-badge citation-inline citation-end">
                      [{ref.citation}]
                    </a>
                  </div>
                ))}
              </div>
            ) : (
              <div className="muted">No references.</div>
            )}
          </div>
        </div>
      ) : (
        <div className="detail-grid single">
          <div className="card">
            <div className="section-head">
              <h3 className="section-title">Evidence</h3>
              <span className="muted">Highlighted context with citation links</span>
            </div>
            {referenceData.evidenceGroups.length > 0 ? (
              <div className="references-list">
                {referenceData.evidenceGroups
                  .filter((group) => group.section !== ALL_URLS_SECTION && group.section !== TTP_SECTION && group.section !== EXEC_SECTION)
                  .map((group) => (
                  <div key={group.section} className="reference-section">
                    <div className="reference-name">{group.section}</div>
                    <div className="evidence-cards">
                      {group.items.map((ref, idx) => (
                        <div key={`${group.section}-${ref.url || ref.evidence || idx}`} className="evidence-card">
                          {ref.kind ? <div className="reference-block-kind">{ref.kind}</div> : null}
                          {ref.title ? <div className="reference-block-title">{ref.title}</div> : null}
                          {ref.evidence ? <div className="reference-block-body">{ref.evidence}</div> : null}
                          {ref.citation && ref.url ? (
                            <a href={ref.url} target="_blank" rel="noreferrer" className="citation-badge citation-inline citation-end">
                              [{ref.citation}]
                            </a>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

              </div>
            ) : (
              <div className="muted">No evidence.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

