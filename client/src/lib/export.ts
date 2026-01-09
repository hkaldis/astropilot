import { format, parseISO } from "date-fns";
import type { ObservationSession, Location, Observation, CelestialObject } from "@shared/schema";

interface SessionWithDetails extends ObservationSession {
  location: Location | null;
  observations: (Observation & { object: CelestialObject })[];
}

export function exportSessionsToCSV(sessions: SessionWithDetails[]): void {
  const headers = [
    "Date",
    "Location",
    "Bortle Scale",
    "Total Score",
    "DSO Score",
    "Planet Score",
    "Seeing",
    "Transparency",
    "Temperature (°C)",
    "Objects Observed",
    "Notes"
  ];

  const rows = sessions.map((session) => {
    const objectsList = session.observations
      ?.map((obs) => obs.object?.catalogId || obs.object?.name)
      .filter(Boolean)
      .join("; ") || "";

    return [
      format(parseISO(session.date.toString()), "yyyy-MM-dd"),
      session.location?.name || "",
      session.location?.bortleScale?.toString() || "",
      session.totalScore?.toString() || "",
      session.dsoScore?.toString() || "",
      session.planetScore?.toString() || "",
      session.seeing?.toString() || "",
      session.transparency?.toString() || "",
      session.temperature?.toString() || "",
      objectsList,
      (session.notes || "").replace(/"/g, '""')
    ];
  });

  const csvContent = [
    headers.join(","),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
  ].join("\n");

  downloadFile(csvContent, "observation-sessions.csv", "text/csv");
}

export function exportObservationsToCSV(sessions: SessionWithDetails[]): void {
  const headers = [
    "Date",
    "Location",
    "Object ID",
    "Object Name",
    "Category",
    "Constellation",
    "Magnitude",
    "Magnification",
    "Exit Pupil (mm)",
    "Visibility Rating",
    "Imaged",
    "Notes"
  ];

  const rows: string[][] = [];
  
  sessions.forEach((session) => {
    session.observations?.forEach((obs) => {
      rows.push([
        format(parseISO(session.date.toString()), "yyyy-MM-dd"),
        session.location?.name || "",
        obs.object?.catalogId || "",
        obs.object?.name || "",
        obs.object?.category || "",
        obs.object?.constellation || "",
        obs.object?.magnitude?.toString() || "",
        obs.magnification?.toString() || "",
        obs.exitPupil?.toString() || "",
        obs.visibilityRating?.toString() || "",
        obs.imagingDone ? "Yes" : "No",
        (obs.notes || "").replace(/"/g, '""')
      ]);
    });
  });

  const csvContent = [
    headers.join(","),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
  ].join("\n");

  downloadFile(csvContent, "observations.csv", "text/csv");
}

export function generatePDFContent(sessions: SessionWithDetails[]): string {
  const styles = `
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        line-height: 1.6;
        color: #1a1a2e;
        max-width: 800px;
        margin: 0 auto;
        padding: 20px;
      }
      h1 {
        color: #1a1a2e;
        border-bottom: 2px solid #3b82f6;
        padding-bottom: 10px;
      }
      h2 {
        color: #374151;
        margin-top: 30px;
      }
      .session {
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 16px;
        margin-bottom: 20px;
        page-break-inside: avoid;
      }
      .session-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
      }
      .session-date {
        font-size: 1.1em;
        font-weight: 600;
      }
      .session-location {
        color: #6b7280;
      }
      .scores {
        display: flex;
        gap: 16px;
        margin: 12px 0;
        padding: 8px;
        background: #f9fafb;
        border-radius: 4px;
      }
      .score-item {
        text-align: center;
      }
      .score-value {
        font-size: 1.2em;
        font-weight: 600;
        color: #3b82f6;
      }
      .score-label {
        font-size: 0.8em;
        color: #6b7280;
      }
      .observations {
        margin-top: 12px;
      }
      .observation {
        padding: 8px 12px;
        background: #f3f4f6;
        border-radius: 4px;
        margin-bottom: 8px;
      }
      .object-name {
        font-weight: 600;
      }
      .object-id {
        color: #6b7280;
        font-family: monospace;
      }
      .observation-details {
        font-size: 0.9em;
        color: #4b5563;
        margin-top: 4px;
      }
      .notes {
        margin-top: 12px;
        padding: 8px 12px;
        background: #fffbeb;
        border-left: 3px solid #f59e0b;
        font-style: italic;
      }
      .summary {
        background: #f0f9ff;
        border: 1px solid #3b82f6;
        border-radius: 8px;
        padding: 16px;
        margin-bottom: 24px;
      }
      .summary h2 {
        margin-top: 0;
        color: #1e40af;
      }
      @media print {
        body {
          print-color-adjust: exact;
          -webkit-print-color-adjust: exact;
        }
        .session {
          break-inside: avoid;
        }
      }
    </style>
  `;

  const totalObservations = sessions.reduce(
    (sum, s) => sum + (s.observations?.length || 0), 
    0
  );
  
  const avgTotalScore = sessions.length > 0
    ? (sessions.reduce((sum, s) => sum + (s.totalScore || 0), 0) / sessions.length).toFixed(1)
    : "N/A";

  const uniqueObjects = new Set(
    sessions.flatMap(s => s.observations?.map(o => o.object?.catalogId) || [])
  ).size;

  const summary = `
    <div class="summary">
      <h2>Observation Log Summary</h2>
      <p><strong>Total Sessions:</strong> ${sessions.length}</p>
      <p><strong>Total Observations:</strong> ${totalObservations}</p>
      <p><strong>Unique Objects:</strong> ${uniqueObjects}</p>
      <p><strong>Average Total Score:</strong> ${avgTotalScore}/100</p>
      <p><strong>Date Range:</strong> ${sessions.length > 0 
        ? `${format(parseISO(sessions[sessions.length - 1].date.toString()), "MMM d, yyyy")} - ${format(parseISO(sessions[0].date.toString()), "MMM d, yyyy")}`
        : "N/A"}</p>
    </div>
  `;

  const sessionsHtml = sessions.map(session => `
    <div class="session">
      <div class="session-header">
        <span class="session-date">${format(parseISO(session.date.toString()), "EEEE, MMMM d, yyyy")}</span>
        <span class="session-location">${session.location?.name || "Unknown Location"}</span>
      </div>
      
      <div class="scores">
        ${session.totalScore != null ? `
          <div class="score-item">
            <div class="score-value">${session.totalScore}</div>
            <div class="score-label">Total Score</div>
          </div>
        ` : ""}
        ${session.dsoScore != null ? `
          <div class="score-item">
            <div class="score-value">${session.dsoScore}</div>
            <div class="score-label">DSO</div>
          </div>
        ` : ""}
        ${session.planetScore != null ? `
          <div class="score-item">
            <div class="score-value">${session.planetScore}</div>
            <div class="score-label">Planet</div>
          </div>
        ` : ""}
        ${session.seeing != null ? `
          <div class="score-item">
            <div class="score-value">${session.seeing}/5</div>
            <div class="score-label">Seeing</div>
          </div>
        ` : ""}
        ${session.transparency != null ? `
          <div class="score-item">
            <div class="score-value">${session.transparency}/5</div>
            <div class="score-label">Transparency</div>
          </div>
        ` : ""}
      </div>

      ${session.observations && session.observations.length > 0 ? `
        <div class="observations">
          <strong>Observations (${session.observations.length}):</strong>
          ${session.observations.map(obs => `
            <div class="observation">
              <span class="object-id">${obs.object?.catalogId || ""}</span>
              <span class="object-name">${obs.object?.name || "Unknown"}</span>
              <div class="observation-details">
                ${obs.magnification ? `${obs.magnification}x` : ""}
                ${obs.exitPupil ? ` | ${obs.exitPupil}mm EP` : ""}
                ${obs.visibilityRating ? ` | Rating: ${obs.visibilityRating}/5` : ""}
                ${obs.imagingDone ? " | Imaged" : ""}
              </div>
              ${obs.notes ? `<div class="observation-details"><em>${obs.notes}</em></div>` : ""}
            </div>
          `).join("")}
        </div>
      ` : ""}

      ${session.notes ? `
        <div class="notes">${session.notes}</div>
      ` : ""}
    </div>
  `).join("");

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>AstroPilot Observation Log</title>
      ${styles}
    </head>
    <body>
      <h1>AstroPilot Observation Log</h1>
      <p>Generated on ${format(new Date(), "MMMM d, yyyy 'at' h:mm a")}</p>
      ${summary}
      <h2>Session Details</h2>
      ${sessionsHtml}
    </body>
    </html>
  `;
}

export function exportToPDF(sessions: SessionWithDetails[]): void {
  const htmlContent = generatePDFContent(sessions);
  
  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    
    setTimeout(() => {
      printWindow.print();
    }, 250);
  }
}

function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
