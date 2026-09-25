"use client";
export default function Overview() {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Overview</h2>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {["Gateway","Workers","Blocked","Stale"].map((l)=> (
          <div key={l} className="rounded-xl border bg-neutral-900 p-5">
            <div className="text-xs text-neutral-400">{l}</div>
            <div className="text-3xl font-bold">{l==="Workers"?"3":l==="Blocked"?"0":"Running"}</div>
          </div>
        ))}
      </div>
      <div className="rounded-xl border bg-neutral-900 p-5">
        <h3 className="text-sm font-medium mb-3">Agent Mesh (7 profiles)</h3>
        <div className="grid grid-cols-2 md:grid-cols-7 gap-2 text-xs">
          {["default","ceo-bor","principal-engineer","social-media","management-research","frontend","backend"].map((n)=>(<div key={n} className="rounded bg-neutral-800 px-2 py-3 text-center">{n}<br/><span className="text-neutral-500">port {9900 + ["default","ceo-bor","principal-engineer","social-media","management-research","frontend","backend"].indexOf(n)}</span></div>))}
        </div>
      </div>
    </div>
  );
}
