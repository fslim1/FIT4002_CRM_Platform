export default function KanbanMock() {
    return (
        <div
            className="relative aspect-[5/4] w-full max-w-xl drop-shadow-2xl"
            style={{transform: 'rotate(6deg)'}}
            aria-hidden
        >
            <div className="absolute inset-0 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-300">
                {/* Window chrome */}
                <div className="flex items-center gap-1.5 bg-[#1B1C3A] px-3 py-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-400"/>
                    <span className="h-2.5 w-2.5 rounded-full bg-yellow-300"/>
                    <span className="h-2.5 w-2.5 rounded-full bg-green-400"/>
                </div>

                {/* App header */}
                <div className="bg-[#253984] px-4 pt-3 pb-2">
                    <div className="h-3 w-32 rounded-full bg-white/70"/>
                </div>

                {/* Board */}
                <div className="space-y-3 bg-slate-50 p-4">
                    <div className="grid grid-cols-3 gap-3">
                        <Column accent="bg-[#DDE6FF]"/>
                        <Column accent="bg-[#CBD9FF]"/>
                        <Column accent="bg-[#B9CCFF]"/>
                    </div>
                    <div className="rounded-lg bg-[#EAF0FF] p-3">
                        <div className="mb-2 h-2 w-24 rounded-full bg-[#253984]/35"/>
                        <div className="h-2 w-40 rounded-full bg-[#253984]/20"/>
                    </div>
                </div>
            </div>
        </div>
    )
}

function Column({accent}) {
    return (
        <div className={`rounded-lg ${accent} p-3`}>
            <div className="mb-2 h-2 w-12 rounded-full bg-[#253984]/45"/>
            <div className="h-2 w-16 rounded-full bg-[#253984]/25"/>
        </div>
    )
}
