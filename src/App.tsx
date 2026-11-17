import { useMemo, useState } from "react";
import clsx from "clsx";
import { cartridges, categories } from "./data/cartridges";
import { buildModel } from "./model/build";
import { swatchColor } from "./model/materials";
import type { Cartridge, Load } from "./model/types";
import { references } from "./scene/ReferenceObjects";
import { Viewer } from "./scene/Viewer";
import type { Hover } from "./scene/Round";

export function App() {
  const [selectedId, setSelectedId] = useState("9mm-luger");
  const [loadId, setLoadId] = useState("fmj");
  const [referenceId, setReferenceId] = useState("none");
  const [hover, setHover] = useState<Hover>(null);
  const [legendHover, setLegendHover] = useState<string | null>(null);
  const cartridge = cartridges.find((item) => item.id === selectedId);
  if (!cartridge) throw new Error(`Unknown cartridge ${selectedId}`);
  const load = cartridge.loads.find((item) => item.id === loadId);
  if (!load) throw new Error(`Unknown load ${loadId} for ${selectedId}`);
  const reference = referenceId === "none" ? null : references.find((item) => item.id === referenceId);
  if (reference === undefined) throw new Error(`Unknown reference ${referenceId}`);

  const legend = useMemo(() => {
    const model = buildModel(load);
    const entries = new Map<string, string>();
    for (const item of [...model.parts, ...model.extras]) {
      if (!entries.has(item.name)) entries.set(item.name, swatchColor(item.material));
    }
    return [...entries.entries()];
  }, [load]);

  const highlighted = legendHover ?? hover?.name ?? null;

  return (
    <div className="flex h-full text-neutral-200 antialiased">
      <aside className="flex w-60 shrink-0 flex-col border-r border-white/5 bg-neutral-950">
        <div className="px-5 pt-5 pb-3">
          <h1 className="text-sm font-semibold tracking-tight text-neutral-100">Fireman</h1>
          <p className="text-xs text-neutral-500">{cartridges.length} cartridges, true scale</p>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 pb-6">
          {categories.map((category) => (
            <div key={category} className="mt-3">
              <h2 className="px-3 pb-1 text-[11px] font-medium tracking-wider text-neutral-500 uppercase">{category}</h2>
              {cartridges
                .filter((item) => item.category === category)
                .map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setSelectedId(item.id);
                      setLoadId(item.loads[0].id);
                      setHover(null);
                    }}
                    className={clsx(
                      "flex w-full items-baseline justify-between gap-2 rounded-md px-3 py-1.5 text-left text-sm transition-colors",
                      item.id === selectedId ? "bg-white/10 text-white" : "text-neutral-400 hover:bg-white/5 hover:text-neutral-200",
                    )}
                  >
                    <span className="truncate">{item.name}</span>
                    <span className="shrink-0 text-[11px] text-neutral-600">{item.loads.length > 1 ? `${item.loads.length} loads` : item.loads[0].name}</span>
                  </button>
                ))}
            </div>
          ))}
        </nav>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-4 border-b border-white/5 px-4">
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {cartridge.loads.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setLoadId(item.id);
                  setHover(null);
                }}
                className={clsx(
                  "flex shrink-0 items-baseline gap-1.5 rounded-md px-2.5 py-1 text-sm whitespace-nowrap transition-colors",
                  item.id === load.id ? "bg-white/10 text-white" : "text-neutral-400 hover:bg-white/5 hover:text-neutral-200",
                )}
              >
                {item.type}
                <span className={clsx("text-[11px]", item.id === load.id ? "text-neutral-400" : "text-neutral-600")}>{item.name}</span>
              </button>
            ))}
          </div>
          <label className="flex shrink-0 items-center gap-2 text-xs text-neutral-500">
            Compare with
            <select
              value={referenceId}
              onChange={(event) => {
                setReferenceId(event.target.value);
                setHover(null);
              }}
              className="rounded-md bg-white/5 px-2 py-1 text-sm text-neutral-200 ring-1 ring-white/10 outline-none hover:bg-white/10 focus-visible:ring-blue-500"
            >
              <option value="none">Nothing</option>
              {references.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="relative min-h-0 flex-1">
          <Viewer
            load={load}
            frameId={`${cartridge.id}/${load.id}`}
            reference={reference}
            hover={hover}
            highlighted={highlighted}
            onHover={setHover}
          />
        </div>
      </main>

      <section className="w-80 shrink-0 overflow-y-auto border-l border-white/5 bg-neutral-950 px-6 py-6">
        <h2 className="text-xl font-semibold tracking-tight text-white">{cartridge.name}</h2>
        <p className="mt-0.5 text-sm text-neutral-500">{cartridge.aliases}</p>
        <p className="mt-4 text-sm leading-relaxed text-neutral-400">{cartridge.note}</p>
        {load.note && <p className="mt-2 text-sm leading-relaxed text-neutral-400">{load.note}</p>}

        <Specs title="Dimensions" rows={dimensionRows(cartridge, load)} />
        <Specs title="Ballistics" rows={ballisticRows(cartridge, load)} />
        <Specs title="Construction" rows={constructionRows(cartridge)} />

        <h3 className="mt-7 mb-2 text-[11px] font-medium tracking-wider text-neutral-500 uppercase">Parts</h3>
        <ul>
          {legend.map((entry) => (
            <li
              key={entry[0]}
              onMouseEnter={() => setLegendHover(entry[0])}
              onMouseLeave={() => setLegendHover(null)}
              className={clsx(
                "flex cursor-default items-center gap-2.5 rounded-md px-2 py-1 text-sm",
                highlighted === entry[0] ? "bg-blue-500/15 text-white" : "text-neutral-300",
              )}
            >
              <span className="size-3 shrink-0 rounded-sm ring-1 ring-white/15" style={{ backgroundColor: entry[1] }} />
              {entry[0]}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Specs(props: { title: string; rows: [string, string][] }) {
  return (
    <>
      <h3 className="mt-7 mb-2 text-[11px] font-medium tracking-wider text-neutral-500 uppercase">{props.title}</h3>
      <dl className="divide-y divide-white/5">
        {props.rows.map((row) => (
          <div key={row[0]} className="flex justify-between gap-4 py-1.5 text-sm">
            <dt className="text-neutral-500">{row[0]}</dt>
            <dd className="text-right text-neutral-200 tabular-nums">{row[1]}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

function length(mm: number) {
  if (mm >= 100) return `${format(mm, 0)} mm · ${format(mm / 25.4, 2)} in`;
  return `${format(mm, 2)} mm · ${(mm / 25.4).toFixed(3).replace(/^0/, "")} in`;
}

function format(value: number, digits: number) {
  return value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function diameterLabel(cartridge: Cartridge) {
  if (cartridge.category === "Shotgun") return "Bore";
  if (cartridge.category === "Tank" || cartridge.category === "Autocannon") return "Caliber";
  return "Bullet diameter";
}

function dimensionRows(cartridge: Cartridge, load: Load): [string, string][] {
  return [
    [diameterLabel(cartridge), length(cartridge.boreD)],
    [cartridge.category === "Shotgun" ? "Shell length" : "Case length", length(cartridge.caseLength)],
    ["Overall length", length(load.oal)],
    ["Rim diameter", length(cartridge.rimD)],
  ];
}

function mass(grams: number) {
  if (grams >= 1000) return `${format(grams / 1000, 2)} kg · ${format(grams / 453.592, 1)} lb`;
  if (grams >= 100) return `${format(grams, 0)} g · ${format(grams * 15.4324, 0)} gr`;
  return `${format(grams * 15.4324, 0)} gr · ${format(grams, 2)} g`;
}

function energy(joules: number) {
  const footPounds = format(joules * 0.737562, 0);
  if (joules >= 1e6) return `${format(joules / 1e6, 2)} MJ`;
  if (joules >= 1e4) return `${format(joules / 1000, 1)} kJ · ${footPounds} ft·lbf`;
  return `${format(joules, 0)} J · ${footPounds} ft·lbf`;
}

function ballisticRows(cartridge: Cartridge, load: Load): [string, string][] {
  const joules = 0.5 * (load.projectileMass / 1000) * load.velocity ** 2;
  const rows: [string, string][] = [
    ["Load", load.name],
    ["Type", load.type],
    [cartridge.category === "Shotgun" ? "Payload" : "Projectile", mass(load.projectileMass)],
    ["Muzzle velocity", `${format(load.velocity, 0)} m/s · ${format(load.velocity * 3.28084, 0)} ft/s`],
    ["Muzzle energy", energy(joules)],
  ];
  if (cartridge.pressure) {
    rows.push(["Max pressure", `${format(cartridge.pressure.mpa, 0)} MPa · ${format(cartridge.pressure.mpa * 145.038, 0)} psi`]);
    rows.push(["Pressure standard", cartridge.pressure.standard]);
  }
  return rows;
}

function constructionRows(cartridge: Cartridge): [string, string][] {
  return [
    ["Primer", cartridge.primer],
    ["Case", cartridge.caseMaterial],
    ["Introduced", cartridge.introduced],
  ];
}
