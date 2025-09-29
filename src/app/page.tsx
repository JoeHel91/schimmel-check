"use client";
import { useState, useMemo } from "react";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/solid";
// Für PDF-Export
import jsPDF from "jspdf";

export default function Page() {
  const [raumTemp, setRaumTemp] = useState("");
  const [relFeuchte, setRelFeuchte] = useState("");
  const [wandTemp, setWandTemp] = useState("");
  const [aussenTemp, setAussenTemp] = useState(""); // nur für SIA
  const [kommentar, setKommentar] = useState("");   // Freitextfeld

  const toNum = (s: string) => {
    const x = parseFloat(s.replace(",", "."));
    return Number.isFinite(x) ? x : NaN;
  };

  // Magnus-Formel (liefert hPa!)
  const e_s = (t: number) => 6.112 * Math.exp((17.62 * t) / (243.12 + t));

  // --- Schimmel-Check (Oberflächenbewertung) ---
  const result = useMemo(() => {
    const T = toNum(raumTemp);
    const phi = toNum(relFeuchte);
    const Tw = toNum(wandTemp);

    if (!Number.isFinite(T) || !Number.isFinite(phi) || !Number.isFinite(Tw)) {
      return null;
    }

    const phiClamped = Math.min(100, Math.max(0, phi));
    const e_s_T = e_s(T);                // hPa
    const e = (phiClamped / 100) * e_s_T;
    const e_s_Tw = e_s(Tw);              // hPa
    const phi_w = (e / e_s_Tw) * 100;

    if (phi_w < 65) return { phi_w, status: "green", text: "Unkritisch" };
    if (phi_w < 70) return { phi_w, status: "yellow", text: "Kritisch" };
    if (phi_w < 100) return { phi_w, status: "red", text: "Schimmelgefahr" };
    return { phi_w, status: "blue", text: "Taupunkt erreicht – Kondensation" };
  }, [raumTemp, relFeuchte, wandTemp]);

  const icon = {
    green: <CheckCircleIcon className="h-16 w-16 text-green-500 drop-shadow-lg" />,
    yellow: <ExclamationTriangleIcon className="h-16 w-16 text-yellow-500 drop-shadow-lg" />,
    red: <span className="text-6xl drop-shadow-lg">🦠</span>,
    blue: <span className="text-6xl drop-shadow-lg">💧</span>,
  };

  // --- Nichtlineare Skala für Ampel ---
  const mapToBar = (phi: number) => {
    const x = Math.max(0, Math.min(phi, 120));
    if (x <= 60) {
      return (x / 60) * 60;
    } else if (x <= 70) {
      return 60 + ((x - 60) / 10) * 15;
    } else if (x <= 100) {
      return 75 + ((x - 70) / 30) * 20;
    } else {
      return 95 + ((x - 100) / 20) * 5;
    }
  };

  // --- SIA Rechner ---
  const siaResult = useMemo(() => {
    const T = toNum(raumTemp);
    const phi = toNum(relFeuchte);
    const Ta = toNum(aussenTemp);

    if (!Number.isFinite(T) || !Number.isFinite(phi) || !Number.isFinite(Ta)) {
      return null;
    }

    const p_i_max = 0.3744 * Ta * Ta + 27.607 * Ta + 1112.2; // Pa
    const p_sat_i_hPa = e_s(T);
    const p_sat_i_Pa = p_sat_i_hPa * 100;

    const phi_i_max = (100 * p_i_max) / p_sat_i_Pa;

    return {
      phi_i_max,
      isOk: phi <= phi_i_max,
    };
  }, [raumTemp, relFeuchte, aussenTemp]);

  // --- Schuldfrage ---
  const schuldResult = useMemo(() => {
    if (!result || !siaResult) return null;

    const phi_w = result.phi_w;
    const phi = toNum(relFeuchte);
    const phi_i_max = siaResult.phi_i_max;
    const isSiaOk = siaResult.isOk;
    const Tw = toNum(wandTemp);

    if (Tw < 13) {
      if (phi > phi_i_max) {
        return { schuld: "Gebäude + Nutzer (beides kritisch)", color: "text-red-600" };
      } else {
        return { schuld: "Gebäudeseitig (Oberfläche < 13°C)", color: "text-red-600" };
      }
    }

    if (isSiaOk && phi < 70 && phi_w > 70) {
      return { schuld: "Gebäudeseitig", color: "text-red-600" };
    }

    if (phi > phi_i_max) {
      return { schuld: "Nutzerseitig", color: "text-orange-600" };
    }

    return { schuld: "Gemischt / unklar", color: "text-gray-600" };
  }, [result, siaResult, relFeuchte, wandTemp]);

// --- PDF Export (verbessert & mit Layout) ---
const handleExportPDF = () => {
  const doc = new jsPDF();
  doc.setFont("helvetica", "normal");

  const img = new Image();
img.src = "/logo.png"; // weil es im public-Ordner liegt
doc.addImage(img, "PNG", 20, 10, 30, 15); // x, y, breite, höhe


  // Header
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Auswertung Schimmel-Check", 55, 20);
  doc.setLineWidth(0.5);
  doc.line(20, 28, 190, 28);

  // Basisdaten
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Basisdaten, Durchschnittswerte", 20, 40);

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  let y = 50;
  const addRow = (label: string, value: string) => {
    doc.text(label, 20, y);
    doc.text(value, 120, y);
    y += 8;
  };

  addRow("Raumtemperatur", `${raumTemp} °C`);
  addRow("Relative Luftfeuchte", `${relFeuchte} %`);
  addRow("Oberflächentemperatur", `${wandTemp} °C`);
  addRow("Aussentemperatur", `${aussenTemp} °C`);

  // Ergebnisse
  if (result) {
    y += 12;
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Bewertung der betroffenen Fläche", 20, y);
    y += 10;

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    addRow("Oberflächen-Feuchte", `${result.phi_w.toFixed(1)} %`);
    addRow("Bewertung", result.text);
  }

  if (siaResult) {
    y += 12;
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Bewertung nach SIA 180", 20, y);
    y += 10;

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    addRow(
      "Max. erlaubte rel. Feuchte",
      `${siaResult.phi_i_max.toFixed(1)} %`
    );
    addRow(
      "SIA Bewertung",
      siaResult.isOk ? "SIA-konform" : "Nicht SIA-konform"
    );
  }

  if (schuldResult) {
    y += 12;
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Schlussfolgerung", 20, y);
    y += 10;

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`${schuldResult.schuld}`, 20, y);
  }

  if (kommentar) {
  y += 20;
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Kommentar / Beobachtungen", 20, y);
  y += 8;

  doc.setFontSize(11);
  doc.setFont("helvetica", "italic");
  doc.setFillColor(245, 245, 245); // FIX: statt nur 245
  const splitText = doc.splitTextToSize(kommentar, 170);
  doc.rect(18, y - 6, 174, splitText.length * 6 + 8, "F");
  doc.text(splitText, 20, y);
  y += splitText.length * 6 + 10;
}


  // Footer
  const date = new Date().toLocaleDateString("de-CH");
  doc.setLineWidth(0.3);
  doc.line(20, 280, 190, 280);
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text("Automatisch erstellt mit Schimmel-Check App · © Joël Heller", 20, 287);
  doc.text(`Erstellt am: ${date}`, 190, 287, { align: "right" });

  doc.save("schimmel-check.pdf");
};


  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-200 via-blue-200 to-purple-200 p-6">
      <div className="backdrop-blur-xl bg-white/70 border border-white/30 rounded-3xl shadow-2xl p-8 w-full max-w-md">
        {/* Titel */}
        <h1 className="text-4xl font-extrabold text-center text-indigo-700 mb-8 tracking-tight drop-shadow-sm">
          🦠Schimmel-Check💧
        </h1>

        {/* Eingabefelder */}
        <div className="space-y-6">
          <input type="number" placeholder="Raumtemperatur (°C)" value={raumTemp} onChange={(e) => setRaumTemp(e.target.value)}
            className="w-full p-4 rounded-xl border border-gray-200 shadow-inner bg-white/60 focus:outline-none focus:ring-4 focus:ring-indigo-300 focus:border-indigo-400 transition"/>
          <input type="number" placeholder="Relative Luftfeuchte (%)" value={relFeuchte} onChange={(e) => setRelFeuchte(e.target.value)}
            className="w-full p-4 rounded-xl border border-gray-200 shadow-inner bg-white/60 focus:outline-none focus:ring-4 focus:ring-indigo-300 focus:border-indigo-400 transition"/>
          <input type="number" placeholder="Oberflächentemperatur (°C)" value={wandTemp} onChange={(e) => setWandTemp(e.target.value)}
            className="w-full p-4 rounded-xl border border-gray-200 shadow-inner bg-white/60 focus:outline-none focus:ring-4 focus:ring-indigo-300 focus:border-indigo-400 transition"/>
          <input type="number" placeholder="Aussentemperatur (°C)" value={aussenTemp} onChange={(e) => setAussenTemp(e.target.value)}
            className="w-full p-4 rounded-xl border border-gray-200 shadow-inner bg-white/60 focus:outline-none focus:ring-4 focus:ring-indigo-300 focus:border-indigo-400 transition"/>

          {/* Kommentarfeld */}
          <textarea placeholder="Kommentar / Beobachtungen eingeben..." value={kommentar} onChange={(e) => setKommentar(e.target.value)} rows={3}
            className="w-full p-4 rounded-xl border border-gray-200 shadow-inner bg-white/60 focus:outline-none focus:ring-4 focus:ring-indigo-300 focus:border-indigo-400 transition resize-none"/>
        </div>

        {/* Ergebnisse */}
        {result && (
          <div className="mt-10 flex flex-col items-center text-center transition-all duration-500 ease-in-out">
            {icon[result.status as "green" | "yellow" | "red" | "blue"]}
            <p className={"inline-block mt-4 px-3 py-1 text-sm font-semibold rounded-full " +
                (result.status === "green" ? "bg-green-100 text-green-700"
                  : result.status === "yellow" ? "bg-orange-100 text-orange-700"
                  : result.status === "red" ? "bg-red-100 text-red-700"
                  : "bg-blue-100 text-blue-700")}>
              {result.text}
            </p>
            <p className="text-gray-700 mt-2 text-lg">
              Relative Feuchte auf der Oberfläche:{" "}
              <span className="font-semibold">{result.phi_w.toFixed(1)}%</span>
            </p>
            {/* Ampel */}
            <div className="w-full max-w-sm mt-6 relative">
              <div className="h-4 w-full rounded-full relative"
                style={{backgroundImage:"linear-gradient(to right,#22c55e 0%,#22c55e 60%,#f59e0b 70%,#ef4444 100%)"}}/>
              <div className="absolute top-1/2 -translate-y-1/2"
                style={{ left: `${mapToBar(result.phi_w)}%` }}>
                <div className="w-3 h-3 bg-white border border-gray-700 rounded-full shadow-md"></div>
              </div>
              {([0, 60, 70, 100] as const).map((t) => (
                <div key={t} className="absolute -bottom-5 text-[11px] text-gray-500"
                  style={{ left: `${mapToBar(t)}%`, transform: "translateX(-50%)" }}>{t}%</div>
              ))}
            </div>
          </div>
        )}

        {siaResult && (
          <div className="mt-16 p-6 rounded-2xl bg-white/70 shadow-lg backdrop-blur-md">
            <h2 className="text-2xl font-bold text-indigo-700 mb-4">SIA-Konformitätsprüfung</h2>
            <p className="text-lg">Grenzwert nach SIA:{" "}
              <span className="font-semibold">{siaResult.phi_i_max.toFixed(1)} %</span>
            </p>
            <p className={`mt-2 text-xl font-bold ${siaResult.isOk ? "text-green-600" : "text-red-600"}`}>
              {siaResult.isOk ? "SIA-konform ✅" : "Nicht SIA-konform ❌"}
            </p>
            <p className="text-gray-600 text-sm mt-2">Formel: φᵢ,max = 100 · pᵢ,max / pₛₐₜ(θᵢ) &nbsp; (SIA 180)</p>
          </div>
        )}

        {schuldResult && (
          <div className="mt-6 p-4 rounded-xl bg-white/70 shadow-md backdrop-blur-sm">
            <h3 className="text-lg font-semibold text-indigo-700 mb-2">Schlussfolgerung</h3>
            <p className={`text-xl font-bold ${schuldResult.color}`}>{schuldResult.schuld}</p>
            <p className="text-sm text-gray-600 mt-1">Automatische Einschätzung basierend auf SIA-Norm, Oberflächentemperatur und Messwerten.</p>
          </div>
        )}

        {/* PDF Export Button */}
        <button onClick={handleExportPDF}
          className="mt-8 w-full bg-indigo-600 text-white font-semibold py-3 px-6 rounded-xl shadow-lg hover:bg-indigo-700 transition">
          📄 Bericht als PDF exportieren
        </button>

        {/* Fussnote */}
        <p className="text-xs text-gray-500 mt-10 text-center">
          Berechnung nach der Magnus-Formel (hPa → Pa) · © Joël Heller
        </p>
      </div>
    </main>
  );
}
