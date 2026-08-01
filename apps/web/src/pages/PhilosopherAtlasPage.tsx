import { ArrowRight, BookOpen, ExternalLink, Landmark, Search, X } from "lucide-react";
import { useMemo, useState } from "react";

import kantPortrait from "../assets/philosophers/kant-becker.jpg";
import sartrePortrait from "../assets/philosophers/sartre-cutout-v2.png";
import socratesPortrait from "../assets/philosophers/socrates-cutout.png";
import { philosophers, type Philosopher } from "../data/philosophers";

const portraits: Record<NonNullable<Philosopher["portrait"]>, string> = {
  socrates: socratesPortrait,
  kant: kantPortrait,
  sartre: sartrePortrait,
};

const eraOrder = [
  "古典时代",
  "希腊化时代",
  "罗马时代",
  "晚期古典",
  "教父时代",
  "中世纪",
  "文艺复兴",
  "近代早期",
  "启蒙时代",
  "德国古典",
  "19世纪",
  "现代",
  "当代",
];

const unique = (values: string[]) =>
  [...new Set(values)].sort((a, b) => a.localeCompare(b, "zh-CN"));

export function PhilosopherAtlasPage() {
  const initialSearch = new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("search") ?? "";
  const [query, setQuery] = useState(initialSearch);
  const [era, setEra] = useState("");
  const [region, setRegion] = useState("");
  const [tradition, setTradition] = useState("");
  const [selectedId, setSelectedId] = useState("socrates");

  const eras = useMemo(() => unique(philosophers.map((philosopher) => philosopher.era)), []);
  const regions = useMemo(() => unique(philosophers.map((philosopher) => philosopher.region)), []);
  const traditions = useMemo(
    () => unique(philosophers.flatMap((philosopher) => philosopher.traditions)),
    [],
  );
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
    return philosophers.filter((philosopher) => {
      const searchable = [
        philosopher.name,
        philosopher.englishName,
        philosopher.summary,
        ...philosopher.coreIdeas,
        ...philosopher.works,
      ]
        .join(" ")
        .toLocaleLowerCase("zh-CN");

      return (
        (!normalizedQuery || searchable.includes(normalizedQuery)) &&
        (!era || philosopher.era === era) &&
        (!region || philosopher.region === region) &&
        (!tradition || philosopher.traditions.includes(tradition))
      );
    });
  }, [query, era, region, tradition]);

  const grouped = useMemo(() => {
    const groups = new Map<string, Philosopher[]>();
    filtered.forEach((philosopher) => {
      const current = groups.get(philosopher.era) ?? [];
      current.push(philosopher);
      groups.set(philosopher.era, current);
    });

    return [...groups.entries()].sort(([first], [second]) => {
      const firstIndex = eraOrder.indexOf(first);
      const secondIndex = eraOrder.indexOf(second);
      if (firstIndex === -1 && secondIndex === -1) return first.localeCompare(second, "zh-CN");
      if (firstIndex === -1) return 1;
      if (secondIndex === -1) return -1;
      return firstIndex - secondIndex;
    });
  }, [filtered]);

  const selected = filtered.find((philosopher) => philosopher.id === selectedId) ?? filtered[0] ?? philosophers[0];
  const related = selected.relatedIds
    .map((id) => philosophers.find((philosopher) => philosopher.id === id))
    .filter((philosopher): philosopher is Philosopher => Boolean(philosopher));
  const clear = () => {
    setQuery("");
    setEra("");
    setRegion("");
    setTradition("");
  };

  return (
    <main className="philosopher-atlas-page">
      <header className="atlas-hero">
        <p className="section-kicker">WESTERN PHILOSOPHER ATLAS</p>
        <h1>西方哲学家图鉴</h1>
        <p>
          沿着时代、地域与思想传统进入西方哲学史的馆藏目录。每个人物都是继续阅读与回到自身档案的入口。
        </p>
        <div className="atlas-hero-stats">
          <span>
            <Landmark size={16} />
            {philosophers.length} 位馆藏人物
          </span>
          <span>{eras.length} 个时代分区</span>
          <span>{traditions.length} 条思想传统</span>
          <span>西方哲学范围</span>
        </div>
      </header>

      <section className="atlas-filter-rail" aria-label="筛选哲学家图鉴">
        <label className="atlas-search">
          <span>检索人物或思想</span>
          <div>
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="姓名、核心思想或代表著作"
            />
          </div>
        </label>
        <label>
          <span>时代</span>
          <select value={era} onChange={(event) => setEra(event.target.value)}>
            <option value="">全部时代</option>
            {eras.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          <span>地区</span>
          <select value={region} onChange={(event) => setRegion(event.target.value)}>
            <option value="">全部地区</option>
            {regions.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          <span>传统</span>
          <select value={tradition} onChange={(event) => setTradition(event.target.value)}>
            <option value="">全部传统</option>
            {traditions.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        {query || era || region || tradition ? (
          <button type="button" onClick={clear}>
            <X size={15} />
            清除
          </button>
        ) : null}
      </section>

      {filtered.length === 0 ? (
        <section className="atlas-empty">
          <h2>这条思想回廊暂时没有人物</h2>
          <button type="button" onClick={clear}>
            恢复全部图鉴
          </button>
        </section>
      ) : (
        <div className="atlas-workspace">
          <aside className="atlas-index" aria-label="哲学家馆藏索引">
            <header>
              <span>馆藏索引 / 按时代</span>
              <strong>
                {filtered.length} / {philosophers.length}
              </strong>
            </header>
            <div className="atlas-index-scroll">
              {grouped.map(([groupEra, items]) => (
                <section className="atlas-index-group" key={groupEra}>
                  <header>
                    <span>{groupEra}</span>
                    <strong>{String(items.length).padStart(2, "0")}</strong>
                  </header>
                  <div>
                    {items.map((philosopher, index) => (
                      <button
                        className={philosopher.id === selected.id ? "active" : ""}
                        key={philosopher.id}
                        type="button"
                        aria-current={philosopher.id === selected.id ? "true" : undefined}
                        onClick={() => setSelectedId(philosopher.id)}
                      >
                        <small>{String(index + 1).padStart(2, "0")}</small>
                        <span>
                          <strong>{philosopher.name}</strong>
                          <em>{philosopher.englishName}</em>
                        </span>
                        <i>{philosopher.region}</i>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </aside>

          <article className="atlas-exhibit">
            <div className="atlas-portrait-stage">
              {selected.portrait ? (
                <img src={portraits[selected.portrait]} alt={`${selected.name}肖像`} />
              ) : (
                <div className="atlas-name-seal" aria-label={`${selected.name}文字展签`}>
                  <span>Φ</span>
                  <strong>{selected.name.slice(0, 2)}</strong>
                  <small>PORTRAIT ARCHIVE</small>
                </div>
              )}
              <div className="atlas-era-mark">
                {selected.era}
                <span>{selected.life}</span>
              </div>
            </div>

            <div className="atlas-exhibit-copy">
              <p className="section-kicker">
                COLLECTION / {selected.region} / {selected.era}
              </p>
              <h2>{selected.name}</h2>
              <h3>{selected.englishName}</h3>
              <p className="atlas-summary">{selected.summary}</p>
              <dl>
                <div>
                  <dt>思想传统</dt>
                  <dd>
                    {selected.traditions.map((value) => (
                      <span key={value}>{value}</span>
                    ))}
                  </dd>
                </div>
                <div>
                  <dt>核心思想</dt>
                  <dd>
                    {selected.coreIdeas.map((value) => (
                      <span key={value}>{value}</span>
                    ))}
                  </dd>
                </div>
                <div>
                  <dt>代表著作</dt>
                  <dd>
                    {selected.works.map((value) => (
                      <span key={value}>{value}</span>
                    ))}
                  </dd>
                </div>
              </dl>
              <section className="atlas-relations">
                <span>思想关系 / 可继续进入</span>
                <div>
                  {related.map((philosopher) => (
                    <button type="button" key={philosopher.id} onClick={() => setSelectedId(philosopher.id)}>
                      {philosopher.name}
                      <ArrowRight size={13} />
                    </button>
                  ))}
                </div>
              </section>
              <footer>
                <a
                  className="atlas-archive-link"
                  href={`#archive?philosopher=${encodeURIComponent(selected.name)}`}
                >
                  <BookOpen size={15} />
                  查看相关思想档案
                </a>
                <a href={selected.sourceUrl} target="_blank" rel="noreferrer">
                  资料来源：{selected.sourceLabel}
                  <ExternalLink size={13} />
                </a>
              </footer>
            </div>
          </article>
        </div>
      )}
    </main>
  );
}
