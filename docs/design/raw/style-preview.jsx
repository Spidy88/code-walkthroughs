const T = {
  bg: "#f5f8fb",
  surface: "#ffffff",
  sunken: "#eaeff6",
  border: "#c4cfde",
  borderHair: "#dbe3ed",
  borderStrong: "#7688a4",
  textPrimary: "#0e131d",
  textSecondary: "#3c4a60",
  textTertiary: "#556680",
  primary: "#0a5a80",
  primaryBright: "#0f72a0",
  primarySoft: "#e1f3fb",
  accent: "#a62d40",
  approve: "#1e5c38",
  approveSoft: "#e3efe7",
  reject: "#a62d40",
  rejectSoft: "#f4e3e5",
  info: "#074560",
  infoSoft: "#dde9f0",
  warn: "#8c5400",
  warnSoft: "#f3ead5",
  modified: "#b56e00",
  stale: "#7a4a9a",
  fontBody: "'Inter', -apple-system, system-ui, sans-serif",
  fontMono: "'IBM Plex Mono', 'JetBrains Mono', Menlo, monospace",
};

// Dot-grid background
const dotGrid = {
  backgroundImage:
    "radial-gradient(circle at 0.5px 0.5px, rgba(10, 90, 128, 0.18) 0.5px, transparent 0.5px)",
  backgroundSize: "8px 8px",
};

const Chip = ({ label, color, bg, showDot = true }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "2px 8px",
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: "0.14em",
      textTransform: "uppercase",
      color,
      background: bg,
      border: `1px solid ${color}`,
      fontFamily: T.fontMono,
      borderRadius: 0,
    }}
  >
    {showDot && <span style={{ width: 6, height: 6, background: color }} />}
    {label}
  </span>
);

const Swatch = ({ value, label }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
    <div style={{ height: 40, background: value, border: `1px solid ${T.borderStrong}` }} />
    <div style={{ fontSize: 9, color: T.textTertiary, fontFamily: T.fontMono, letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</div>
    <div style={{ fontSize: 9, color: T.textTertiary, fontFamily: T.fontMono }}>{value}</div>
  </div>
);

const codeLines = [
  { n: 142, t: "export async function handlePurchase(req, res) {", state: null },
  { n: 143, t: "  const user = await authenticate(req)", state: null },
  { n: 144, t: "  if (!user) return res.status(401).send()", state: null },
  { n: 145, t: "", state: null },
  { n: 146, t: "  const { items, paymentMethod } = req.body", state: "modified" },
  { n: 147, t: "  const validated = validateOrder(items)", state: "modified" },
  { n: 148, t: "", state: null },
  { n: 149, t: "  const charge = await billing.charge({", state: "new" },
  { n: 150, t: "    userId: user.id,", state: "new" },
  { n: 151, t: "    amount: validated.total,", state: "new" },
  { n: 152, t: "    method: paymentMethod,", state: "new" },
  { n: 153, t: "  })", state: "new" },
  { n: 154, t: "", state: null },
  { n: 155, t: "  await orders.create({ userId: user.id, charge })", state: null },
  { n: 156, t: "  return res.status(200).json({ ok: true })", state: null },
  { n: 157, t: "}", state: null },
];

// Corner tick
const Tick = ({ pos }) => {
  const base = { position: "absolute", width: 10, height: 10, borderColor: T.primary };
  const map = {
    tl: { top: -1, left: -1, borderTop: `1px solid ${T.primary}`, borderLeft: `1px solid ${T.primary}` },
    tr: { top: -1, right: -1, borderTop: `1px solid ${T.primary}`, borderRight: `1px solid ${T.primary}` },
    bl: { bottom: -1, left: -1, borderBottom: `1px solid ${T.primary}`, borderLeft: `1px solid ${T.primary}` },
    br: { bottom: -1, right: -1, borderBottom: `1px solid ${T.primary}`, borderRight: `1px solid ${T.primary}` },
  };
  return <div style={{ ...base, ...map[pos] }} />;
};

const Preview = () => (
  <div
    style={{
      background: T.bg,
      ...dotGrid,
      color: T.textPrimary,
      fontFamily: T.fontBody,
      fontSize: 15,
      lineHeight: 1.5,
      minHeight: "100vh",
      padding: 32,
    }}
  >
    <div style={{ maxWidth: 1280, margin: "0 auto" }}>
      {/* Title block — drafting-drawing title block */}
      <div
        style={{
          border: `1px solid ${T.primary}`,
          background: T.surface,
          marginBottom: 32,
          display: "grid",
          gridTemplateColumns: "1fr 160px 160px 160px",
        }}
      >
        <div style={{ padding: "12px 16px", borderRight: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 10, fontFamily: T.fontMono, color: T.textTertiary, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 4 }}>
            DRAWING · STYLE_DIRECTION_03
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: T.textPrimary, letterSpacing: "-0.01em", lineHeight: 1.15 }}>
            Blueprint Draft
          </div>
          <div style={{ fontSize: 13, color: T.textSecondary, marginTop: 4 }}>
            Technical drafting for a deterministic review tool.
          </div>
        </div>
        <div style={{ padding: "10px 14px", borderRight: `1px solid ${T.border}`, fontFamily: T.fontMono, fontSize: 10, color: T.textTertiary, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          PROJECT<br />
          <span style={{ color: T.textPrimary, fontSize: 12, letterSpacing: 0 }}>acme-api</span>
        </div>
        <div style={{ padding: "10px 14px", borderRight: `1px solid ${T.border}`, fontFamily: T.fontMono, fontSize: 10, color: T.textTertiary, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          REV<br />
          <span style={{ color: T.textPrimary, fontSize: 12, letterSpacing: 0 }}>feat/checkout-v2</span>
        </div>
        <div style={{ padding: "10px 14px", fontFamily: T.fontMono, fontSize: 10, color: T.textTertiary, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          SHEET<br />
          <span style={{ color: T.textPrimary, fontSize: 12, letterSpacing: 0 }}>01 / 12</span>
        </div>
      </div>

      {/* Hero copy */}
      <div style={{ marginBottom: 28, display: "grid", gridTemplateColumns: "1fr 320px", gap: 40 }}>
        <div>
          <div style={{ fontSize: 10, fontFamily: T.fontMono, color: T.textTertiary, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 8 }}>
            § 01 · INTENT
          </div>
          <div style={{ fontSize: 30, fontWeight: 700, color: T.textPrimary, letterSpacing: "-0.01em", lineHeight: 1.15 }}>
            Walk the path, not the diff.
          </div>
          <div style={{ fontSize: 16, color: T.textSecondary, lineHeight: 1.55, marginTop: 10, maxWidth: 620 }}>
            A local review tool that traces real execution paths through the code, attaches the right checklist to each node, and leaves a record of what you actually looked at.
          </div>
        </div>
        <div style={{ borderLeft: `1px dashed ${T.borderStrong}`, paddingLeft: 16, fontSize: 11, color: T.textTertiary, fontFamily: T.fontMono, letterSpacing: "0.04em" }}>
          <div style={{ color: T.textPrimary, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6 }}>
            NOTES
          </div>
          <div>01 // Color reserved for semantic signal only.</div>
          <div>02 // Hairline rules at 1px; no rounded corners.</div>
          <div>03 // Body set in Inter; code in IBM Plex Mono.</div>
          <div>04 // Baseline grid 8px; scale ratio 1.20.</div>
        </div>
      </div>

      {/* Walkthrough node */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16, marginBottom: 32 }}>
        {/* Code panel with drafting corners */}
        <div style={{ position: "relative", background: T.surface, border: `1px solid ${T.borderStrong}` }}>
          <Tick pos="tl" />
          <Tick pos="tr" />
          <Tick pos="bl" />
          <Tick pos="br" />

          {/* Section header */}
          <div
            style={{
              padding: "10px 14px",
              borderBottom: `1px solid ${T.border}`,
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <div style={{ fontSize: 10, fontFamily: T.fontMono, color: T.textTertiary, letterSpacing: "0.14em", textTransform: "uppercase" }}>
              FIG. A ·
            </div>
            <Chip label="ROUTE_HANDLER" color={T.primary} bg={T.primarySoft} />
            <Chip label="MODIFIED" color={T.modified} bg={T.warnSoft} />
            <Chip label="NEW CALLS" color={T.approve} bg={T.approveSoft} />
            <div style={{ flex: 1 }} />
            <div style={{ fontSize: 10, color: T.textTertiary, fontFamily: T.fontMono, letterSpacing: "0.14em", textTransform: "uppercase" }}>
              NODE 03 / 07
            </div>
          </div>

          {/* Path breadcrumb */}
          <div
            style={{
              padding: "6px 14px",
              fontSize: 12,
              color: T.textSecondary,
              fontFamily: T.fontMono,
              background: T.sunken,
              borderBottom: `1px solid ${T.border}`,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span style={{ color: T.textTertiary, letterSpacing: "0.14em", textTransform: "uppercase", fontSize: 10 }}>PATH</span>
            <span>routes/purchase.ts</span>
            <span style={{ color: T.primary }}>→</span>
            <span>handlePurchase</span>
            <span style={{ color: T.primary }}>→</span>
            <span style={{ color: T.primary, fontWeight: 600 }}>billing.charge</span>
          </div>

          {/* Signature with leader line */}
          <div style={{ padding: "12px 14px 8px", borderBottom: `1px dashed ${T.borderStrong}`, position: "relative" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
              <div style={{ fontSize: 10, fontFamily: T.fontMono, color: T.textTertiary, letterSpacing: "0.14em", textTransform: "uppercase" }}>
                A.1
              </div>
              <div>
                <div style={{ fontFamily: T.fontMono, fontSize: 11, color: T.textTertiary, marginBottom: 2 }}>
                  src/routes/purchase.ts
                </div>
                <div style={{ fontFamily: T.fontMono, fontSize: 15, color: T.textPrimary, fontWeight: 600 }}>
                  handlePurchase(req, res)
                </div>
              </div>
            </div>
          </div>

          {/* Code */}
          <div style={{ fontFamily: T.fontMono, fontSize: 13, lineHeight: 1.55, padding: "6px 0" }}>
            {codeLines.map((l, i) => (
              <div
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: "3px 44px 1fr",
                  alignItems: "center",
                  background:
                    l.state === "new"
                      ? T.approveSoft
                      : l.state === "modified"
                      ? T.warnSoft
                      : "transparent",
                }}
              >
                <div
                  style={{
                    width: 2,
                    height: "100%",
                    background:
                      l.state === "new" ? T.approve : l.state === "modified" ? T.modified : "transparent",
                    marginLeft: 1,
                  }}
                />
                <div style={{ color: T.textTertiary, textAlign: "right", paddingRight: 10, fontSize: 11, userSelect: "none" }}>
                  {l.n}
                </div>
                <div style={{ color: T.textPrimary, paddingRight: 14, whiteSpace: "pre" }}>
                  {l.t || " "}
                </div>
              </div>
            ))}
          </div>

          {/* Dig into */}
          <div
            style={{
              borderTop: `1px solid ${T.border}`,
              padding: "8px 14px",
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 12,
              color: T.textSecondary,
              background: T.sunken,
              fontFamily: T.fontMono,
            }}
          >
            <span style={{ color: T.textTertiary, letterSpacing: "0.14em", textTransform: "uppercase", fontSize: 10 }}>CALLS →</span>
            <span style={{ color: T.textPrimary, fontWeight: 600 }}>billing.charge()</span>
            <div style={{ flex: 1 }} />
            <button
              style={{
                fontFamily: T.fontMono,
                fontSize: 11,
                fontWeight: 600,
                padding: "5px 12px",
                background: "transparent",
                color: T.primary,
                border: `1px solid ${T.primary}`,
                borderRadius: 0,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              DIG IN ↓
            </button>
          </div>
        </div>

        {/* Checklist panel */}
        <div style={{ position: "relative", background: T.surface, border: `1px solid ${T.borderStrong}`, padding: 14 }}>
          <Tick pos="tl" />
          <Tick pos="tr" />
          <Tick pos="bl" />
          <Tick pos="br" />
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: T.textTertiary,
              marginBottom: 10,
              fontWeight: 700,
              fontFamily: T.fontMono,
              borderBottom: `1px solid ${T.border}`,
              paddingBottom: 6,
            }}
          >
            FIG. B · CHECKLIST · ROUTE_HANDLER
          </div>
          {[
            { t: "Authenticates request", s: "pass" },
            { t: "Validates input schema", s: "pass" },
            { t: "Handles errors consistently", s: "fail" },
            { t: "Response shape matches contract", s: "skip" },
          ].map((item, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "7px 0",
                borderBottom: i < 3 ? `1px dashed ${T.border}` : "none",
                fontSize: 13,
                color: T.textPrimary,
              }}
            >
              <div
                style={{
                  width: 14,
                  height: 14,
                  background:
                    item.s === "pass" ? T.approve : item.s === "fail" ? T.reject : "transparent",
                  border:
                    item.s === "skip"
                      ? `1px dashed ${T.borderStrong}`
                      : `1px solid ${item.s === "pass" ? T.approve : T.reject}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  fontSize: 10,
                  fontWeight: 700,
                  flexShrink: 0,
                  borderRadius: 0,
                }}
              >
                {item.s === "pass" ? "✓" : item.s === "fail" ? "✕" : ""}
              </div>
              <div style={{ flex: 1 }}>{item.t}</div>
              <div style={{ fontSize: 9, color: T.textTertiary, fontFamily: T.fontMono, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                {item.s === "pass" ? "PASS" : item.s === "fail" ? "FAIL" : "SKIP"}
              </div>
            </div>
          ))}
          <div
            style={{
              marginTop: 14,
              padding: 10,
              background: T.primarySoft,
              border: `1px solid ${T.primary}`,
              fontSize: 12,
              color: T.textSecondary,
              lineHeight: 1.5,
            }}
          >
            <div style={{ color: T.primary, fontSize: 9, fontFamily: T.fontMono, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 4, fontWeight: 700 }}>
              NOTE · RULE / PROJECT
            </div>
            Every route handler must call an authorize-shaped function before returning success.
          </div>
        </div>
      </div>

      {/* Action row */}
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          padding: 14,
          background: T.surface,
          border: `1px solid ${T.borderStrong}`,
          marginBottom: 32,
        }}
      >
        <button
          style={{
            fontFamily: T.fontBody,
            fontSize: 13,
            fontWeight: 600,
            padding: "8px 18px",
            background: T.approve,
            color: "#fff",
            border: `1px solid ${T.approve}`,
            borderRadius: 0,
            cursor: "pointer",
            letterSpacing: "0.04em",
          }}
        >
          Approve
        </button>
        <button
          style={{
            fontFamily: T.fontBody,
            fontSize: 13,
            fontWeight: 500,
            padding: "7px 16px",
            background: "transparent",
            color: T.reject,
            border: `1px solid ${T.reject}`,
            borderRadius: 0,
            cursor: "pointer",
          }}
        >
          Reject
        </button>
        <button
          style={{
            fontFamily: T.fontBody,
            fontSize: 13,
            fontWeight: 500,
            padding: "7px 16px",
            background: "transparent",
            color: T.textSecondary,
            border: `1px solid ${T.border}`,
            borderRadius: 0,
            cursor: "pointer",
          }}
        >
          Request info
        </button>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, color: T.textTertiary, fontFamily: T.fontMono, letterSpacing: "0.12em", textTransform: "uppercase" }}>
          <span>← PREV</span>
          <span style={{ color: T.primary, fontWeight: 600 }}>NEXT →</span>
        </div>
      </div>

      {/* Input + type scale */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 32 }}>
        <div>
          <label
            style={{
              display: "block",
              fontSize: 10,
              color: T.textTertiary,
              marginBottom: 6,
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              fontFamily: T.fontMono,
            }}
          >
            § C.1 · COMMENT ON NODE
          </label>
          <input
            defaultValue=""
            placeholder="Why are you requesting info on this function?"
            style={{
              width: "100%",
              padding: "9px 12px",
              fontSize: 14,
              fontFamily: T.fontBody,
              color: T.textPrimary,
              background: T.surface,
              border: `1px solid ${T.borderStrong}`,
              borderRadius: 0,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          <div style={{ fontSize: 11, color: T.textTertiary, marginTop: 6, fontFamily: T.fontMono }}>
            Required for <span style={{ color: T.info }}>Request Info</span>; optional otherwise.
          </div>
        </div>
        <div>
          <label
            style={{
              display: "block",
              fontSize: 10,
              color: T.textTertiary,
              marginBottom: 6,
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              fontFamily: T.fontMono,
            }}
          >
            § C.2 · TYPE HIERARCHY
          </label>
          <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.01em", lineHeight: 1.15, color: T.textPrimary }}>
            H1 — Display
          </div>
          <div style={{ fontSize: 21, fontWeight: 600, marginTop: 4, letterSpacing: "-0.005em" }}>
            H2 — Section
          </div>
          <div style={{ fontSize: 17, fontWeight: 600, marginTop: 4 }}>H3 — Subsection</div>
          <div style={{ fontSize: 15, color: T.textPrimary, marginTop: 6, lineHeight: 1.5 }}>
            Body — the reviewer reads the code in the order it runs, not the order it sits in files.
          </div>
          <div style={{ fontSize: 12, color: T.textTertiary, marginTop: 4, fontFamily: T.fontMono }}>
            Caption · Inter / IBM Plex Mono
          </div>
        </div>
      </div>

      {/* Palette */}
      <div>
        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: T.textTertiary,
            fontWeight: 700,
            marginBottom: 10,
            fontFamily: T.fontMono,
          }}
        >
          § D · PALETTE
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 6, marginBottom: 12 }}>
          <Swatch value="#f5f8fb" label="bg" />
          <Swatch value="#ffffff" label="surface" />
          <Swatch value="#eaeff6" label="sunken" />
          <Swatch value="#c4cfde" label="border" />
          <Swatch value="#556680" label="text-3" />
          <Swatch value="#3c4a60" label="text-2" />
          <Swatch value="#0e131d" label="text-1" />
          <Swatch value="#0a5a80" label="primary" />
          <Swatch value="#1e5c38" label="approve" />
          <Swatch value="#a62d40" label="reject" />
          <Swatch value="#074560" label="info" />
          <Swatch value="#b56e00" label="modified" />
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Chip label="APPROVED" color={T.approve} bg={T.approveSoft} />
          <Chip label="REJECTED" color={T.reject} bg={T.rejectSoft} />
          <Chip label="INFO" color={T.info} bg={T.infoSoft} />
          <Chip label="NEW" color={T.approve} bg={T.approveSoft} />
          <Chip label="MODIFIED" color={T.modified} bg={T.warnSoft} />
          <Chip label="STALE" color={T.stale} bg="#eee2f2" />
          <Chip label="NEVER REVIEWED" color={T.textTertiary} bg={T.sunken} showDot={false} />
        </div>
      </div>
    </div>
  </div>
);
