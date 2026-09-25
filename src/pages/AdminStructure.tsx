import { useMemo, useState } from "react";
import { getLevel, type ContentPackage, type ContentMode } from "../engine/content";
import { LevelThumbnail } from "../components/LevelThumbnail";

const builtInIds = ["square", "checkerboard", "circle", "voxel-cube", "voxel-hollow-cube", "voxel-cylinder", "voxel-sphere", "voxel-stairs", "voxel-pyramid", "voxel-house"];
const byOrder = <T extends { order: number }>(items: T[]) => [...items].sort((a, b) => a.order - b.order);
const makeId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

export function AdminStructure({ page, content, change, setNotice }: {
  page: "chapters" | "arrangement";
  content: ContentPackage;
  change: (next: ContentPackage) => boolean;
  setNotice: (message: string) => void;
}) {
  const [chapterId, setChapterId] = useState(content.chapters[0]?.id ?? "");
  const [sectionId, setSectionId] = useState(content.sections[0]?.id ?? "");
  const [selection, setSelection] = useState<{ kind: "chapter" | "section"; id: string } | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [destination, setDestination] = useState("");
  const [newKind, setNewKind] = useState<"chapter" | "section" | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [confirmation, setConfirmation] = useState<"delete" | "archive" | "move" | null>(null);
  const [undo, setUndo] = useState<ContentPackage | null>(null);
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<"all" | ContentMode>("all");
  const [poolStatus, setPoolStatus] = useState<"unplaced" | "all">("unplaced");
  const [checked, setChecked] = useState<string[]>([]);
  const [currentChecked, setCurrentChecked] = useState<string[]>([]);
  const [batchDestination, setBatchDestination] = useState("");

  const chapter = content.chapters.find((item) => item.id === chapterId);
  const section = content.sections.find((item) => item.id === sectionId);
  const selected = selection?.kind === "chapter"
    ? content.chapters.find((item) => item.id === selection.id)
    : content.sections.find((item) => item.id === selection?.id);
  function select(kind: "chapter" | "section", id: string) {
    const item = kind === "chapter" ? content.chapters.find((entry) => entry.id === id) : content.sections.find((entry) => entry.id === id);
    setSelection({ kind, id });
    setTitle(item?.title ?? "");
    setDescription(item?.description ?? "");
    setDestination(kind === "section" ? content.sections.find((entry) => entry.id === id)?.chapterId ?? "" : "");
    setConfirmation(null);
  }

  const levelIds = useMemo(() => [...content.levels.map((item) => item.id), ...builtInIds], [content.levels]);
  const placed = (id: string) => content.placements.find((item) => item.levelId === id);
  const sectionCount = (id: string) => content.placements.filter((item) => item.sectionId === id).length;
  const chapterSections = (id: string) => content.sections.filter((item) => item.chapterId === id);
  const chapterCount = (id: string) => chapterSections(id).reduce((sum, item) => sum + sectionCount(item.id), 0);
  const current = byOrder(content.placements.filter((item) => item.sectionId === sectionId));
  const pool = levelIds.map((id) => getLevel(id, content)).filter((item): item is NonNullable<typeof item> => !!item && !item.archived)
    .filter((item) => item.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()) || item.id.includes(search))
    .filter((item) => mode === "all" || item.mode === mode)
    .filter((item) => poolStatus === "all" ? placed(item.id)?.sectionId !== sectionId : !placed(item.id));

  function commit(next: ContentPackage, message: string) {
    if (change(next)) {
      setUndo(content);
      setNotice(`${message}；可撤回上一步`);
      setConfirmation(null);
      setChecked([]);
      setCurrentChecked([]);
    }
  }
  function create() {
    const name = newTitle.trim();
    if (!name || name.length > 80) { setNotice("名称须为 1～80 字符"); return; }
    if (newKind === "chapter") {
      const id = makeId("chapter");
      commit({ ...content, chapters: [...content.chapters, { id, title: name, description: "", order: content.chapters.length }] }, "已新增大章");
      setChapterId(id); setSelection({ kind: "chapter", id }); setTitle(name); setDescription("");
    } else if (newKind === "section" && chapterId) {
      const id = makeId("section");
      commit({ ...content, sections: [...content.sections, { id, chapterId, title: name, description: "", order: Math.max(-1, ...chapterSections(chapterId).map((item) => item.order)) + 1 }] }, "已新增小节");
      setSectionId(id); setSelection({ kind: "section", id }); setTitle(name); setDescription(""); setDestination(chapterId);
    }
    setNewKind(null); setNewTitle("");
  }
  function reorder(kind: "chapter" | "section", id: string, delta: number) {
    const items = byOrder(kind === "chapter" ? content.chapters : chapterSections(chapterId));
    const index = items.findIndex((item) => item.id === id);
    const next = index + delta;
    if (index < 0 || next < 0 || next >= items.length) return;
    [items[index], items[next]] = [items[next], items[index]];
    if (kind === "chapter") commit({ ...content, chapters: items.map((item, order) => ({ ...item, order })) }, "已调整大章顺序");
    else commit({ ...content, sections: content.sections.map((item) => ({ ...item, order: items.findIndex((candidate) => candidate.id === item.id) < 0 ? item.order : items.findIndex((candidate) => candidate.id === item.id) })) }, "已调整小节顺序");
  }
  function place(ids: string[], target: string) {
    const moving = ids.filter((id) => placed(id)?.sectionId !== target);
    if (!moving.length) return;
    const rest = content.placements.filter((item) => !moving.includes(item.levelId));
    const baseOrder = Math.max(-1, ...rest.filter((item) => item.sectionId === target).map((item) => item.order));
    const additions = target ? moving.map((levelId, index) => ({ levelId, sectionId: target, order: baseOrder + index + 1 })) : [];
    const nextPlacements = [...rest, ...additions];
    const normalized = content.sections.flatMap((candidate) => byOrder(nextPlacements.filter((item) => item.sectionId === candidate.id)).map((item, order) => ({ ...item, order })));
    commit({ ...content, placements: normalized }, target ? `已将 ${moving.length} 关加入「${content.sections.find((item) => item.id === target)?.title}」` : `已将 ${moving.length} 关移入未编排池`);
  }
  function sortLevel(id: string, delta: number) {
    const items = [...current];
    const index = items.findIndex((item) => item.levelId === id);
    const next = index + delta;
    if (next < 0 || next >= items.length) return;
    [items[index], items[next]] = [items[next], items[index]];
    commit({ ...content, placements: [...content.placements.filter((item) => item.sectionId !== sectionId), ...items.map((item, order) => ({ ...item, order }))] }, "已调整关卡顺序");
  }
  function saveDetails() {
    const name = title.trim();
    if (!selected || !name || name.length > 80 || description.length > 1000) { setNotice("名称须为 1～80 字符，简介不超过 1000 字符"); return; }
    if (selection?.kind === "chapter") commit({ ...content, chapters: content.chapters.map((item) => item.id === selected.id ? { ...item, title: name, description } : item) }, "大章信息已保存");
    else commit({ ...content, sections: content.sections.map((item) => item.id === selected.id ? { ...item, title: name, description } : item) }, "小节信息已保存");
  }
  function confirmAction() {
    if (!selection || !selected || !confirmation) return;
    if (confirmation === "move" && selection.kind === "section") {
      if (!destination || destination === content.sections.find((item) => item.id === selected.id)?.chapterId) return;
      commit({ ...content, sections: content.sections.map((item) => item.id === selected.id ? { ...item, chapterId: destination, order: Math.max(-1, ...chapterSections(destination).map((entry) => entry.order)) + 1 } : item) }, `已迁移小节及其 ${sectionCount(selected.id)} 关`);
      setChapterId(destination);
    } else if (confirmation === "archive") {
      if (selection.kind === "chapter") commit({ ...content, chapters: content.chapters.map((item) => item.id === selected.id ? { ...item, archived: !item.archived } : item) }, selected.archived ? "大章已恢复" : "大章已归档");
      else commit({ ...content, sections: content.sections.map((item) => item.id === selected.id ? { ...item, archived: !item.archived } : item) }, selected.archived ? "小节已恢复" : "小节已归档");
    } else if (confirmation === "delete") {
      if (selection.kind === "chapter") {
        if (chapterSections(selected.id).length) { setNotice("请先迁移或删除下属小节"); return; }
        commit({ ...content, chapters: content.chapters.filter((item) => item.id !== selected.id) }, "已删除空大章");
        setChapterId("");
      } else {
        commit({ ...content, sections: content.sections.filter((item) => item.id !== selected.id), placements: content.placements.filter((item) => item.sectionId !== selected.id) }, `已删除小节；${sectionCount(selected.id)} 关移入未编排池`);
        setSectionId("");
      }
      setSelection(null);
    }
  }
  const impact = selection?.kind === "chapter" ? `${chapterSections(selected?.id ?? "").length} 个小节、${chapterCount(selected?.id ?? "")} 个关卡` : `${sectionCount(selected?.id ?? "")} 个关卡`;

  return <div className="admin-management">
    <div className="admin-row admin-management-actions">
      {page === "chapters" && <><button onClick={() => { setNewKind("chapter"); setNewTitle(""); }}>＋ 新增大章</button><button disabled={!chapterId} onClick={() => { setNewKind("section"); setNewTitle(""); }}>＋ 新增小节</button></>}
      {undo && <button onClick={() => { if (change(undo)) { setUndo(content); setNotice("已撤回上一步；可再次撤回以重做"); } }}>撤回上一步</button>}
    </div>
    {newKind && <div className="admin-inline-form"><label>{newKind === "chapter" ? "新大章名称" : `在「${chapter?.title ?? ""}」新增小节`}<input value={newTitle} maxLength={80} onChange={(event) => setNewTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") create(); }} /></label><button onClick={create}>创建</button><button onClick={() => setNewKind(null)}>取消</button></div>}
    <div className={`admin-management-grid ${page === "arrangement" ? "admin-management-grid-three" : ""}`}>
      <section className="admin-tree"><h2>章节目录</h2>{byOrder(content.chapters).map((ch) => <div key={ch.id} className="admin-tree-chapter"><button aria-pressed={page === "chapters" ? selection?.kind === "chapter" && selection.id === ch.id : chapterId === ch.id} onClick={() => { setChapterId(ch.id); if (page === "chapters") select("chapter", ch.id); }}>{ch.title}{ch.archived ? " · 已归档" : ""} <small>{chapterCount(ch.id)} 关</small></button>{byOrder(chapterSections(ch.id)).map((sec) => <button className="admin-tree-section" key={sec.id} aria-pressed={page === "chapters" ? selection?.kind === "section" && selection.id === sec.id : sectionId === sec.id} onClick={() => { setChapterId(ch.id); setSectionId(sec.id); if (page === "chapters") select("section", sec.id); }}>{sec.title}{sec.archived ? " · 已归档" : ""} <small>{sectionCount(sec.id)} 关</small></button>)}</div>)}</section>
      {page === "chapters" ? <section className="admin-structure-editor"><h2>{selection?.kind === "chapter" ? "编辑大章" : selection?.kind === "section" ? "编辑小节" : "选择目录项"}</h2>{selected && <>
        <p className="admin-hint">ID：{selected.id} · 影响范围：{impact}</p>
        <label>名称<input value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} /></label>
        <label>简介<textarea value={description} maxLength={1000} onChange={(event) => setDescription(event.target.value)} /></label>
        <button className="admin-primary" onClick={saveDetails}>保存信息</button>
        <div className="admin-row"><button onClick={() => reorder(selection!.kind, selected.id, -1)}>上移</button><button onClick={() => reorder(selection!.kind, selected.id, 1)}>下移</button></div>
        {selection?.kind === "section" && <div className="admin-inline-form"><label>迁移到大章<select aria-label={`将${selected.title}迁移到大章`} value={destination} onChange={(event) => { setDestination(event.target.value); setConfirmation("move"); }}>{content.chapters.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><button disabled={destination === content.sections.find((item) => item.id === selected.id)?.chapterId} onClick={() => setConfirmation("move")}>迁移小节</button></div>}
        <div className="admin-row"><button onClick={() => setConfirmation("archive")}>{selected.archived ? "恢复" : "归档"}</button><button onClick={() => setConfirmation("delete")}>删除</button></div>
        {confirmation && <div className="admin-impact" role="alert"><strong>{confirmation === "delete" ? `删除「${selected.title}」` : confirmation === "archive" ? `${selected.archived ? "恢复" : "归档"}「${selected.title}」` : `迁移「${selected.title}」`}</strong><p>{confirmation === "delete" ? selection?.kind === "chapter" ? `下属 ${impact}。请先迁移或删除小节；空大章才可删除。` : `涉及 ${impact}，关卡保留原 ID 与学生历史，移入未编排池。` : confirmation === "archive" ? `涉及 ${impact}。${selected.archived ? "恢复后重新显示于学生目录。" : "学生目录将隐藏，关卡和历史进度保留。"}` : `涉及 ${impact}。关卡 ID、顺序和学生历史进度保持不变。`}</p><button onClick={confirmAction}>确认{confirmation === "delete" ? "删除" : confirmation === "archive" ? "操作" : "迁移"}</button><button onClick={() => setConfirmation(null)}>取消</button></div>}
      </>}</section> : <>
        <section className="admin-current"><h2>{section?.title ?? "选择小节"} · 当前关卡 ({current.length})</h2><div className="admin-row"><button onClick={() => setCurrentChecked(current.map((item) => item.levelId))}>全选当前小节</button><button onClick={() => setCurrentChecked([])}>清空选择</button><button disabled={!currentChecked.length} onClick={() => place(currentChecked, "")}>批量移出 ({currentChecked.length})</button></div><div className="admin-row"><select aria-label="批量移动到小节" value={batchDestination} onChange={(event) => setBatchDestination(event.target.value)}><option value="">选择目标小节</option>{content.sections.filter((candidate) => candidate.id !== sectionId).map((candidate) => <option key={candidate.id} value={candidate.id}>{content.chapters.find((ch) => ch.id === candidate.chapterId)?.title} / {candidate.title}</option>)}</select><button disabled={!currentChecked.length || !batchDestination} onClick={() => place(currentChecked, batchDestination)}>批量移动 ({currentChecked.length})</button></div>{current.map((item) => <article key={item.levelId}><input type="checkbox" aria-label={`选择当前 ${item.levelId}`} checked={currentChecked.includes(item.levelId)} onChange={(event) => setCurrentChecked((previous) => event.target.checked ? [...previous, item.levelId] : previous.filter((id) => id !== item.levelId))} /><span>{getLevel(item.levelId, content)?.title ?? item.levelId}<small> · {item.levelId}</small></span><button aria-label={`上移 ${item.levelId}`} onClick={() => sortLevel(item.levelId, -1)}>↑</button><button aria-label={`下移 ${item.levelId}`} onClick={() => sortLevel(item.levelId, 1)}>↓</button><select aria-label={`移动 ${item.levelId} 到小节`} value={sectionId} onChange={(event) => place([item.levelId], event.target.value)}>{content.sections.map((candidate) => <option key={candidate.id} value={candidate.id}>{content.chapters.find((ch) => ch.id === candidate.chapterId)?.title} / {candidate.title}</option>)}</select><button onClick={() => place([item.levelId], "")}>移出</button></article>)}</section>
        <section className="admin-pool"><h2>关卡池</h2><div className="admin-pool-filters"><input aria-label="搜索关卡池" placeholder="搜索名称或 ID" value={search} onChange={(event) => setSearch(event.target.value)} /><select aria-label="关卡池维度" value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}><option value="all">全部维度</option><option value="2d">2D</option><option value="3d">3D</option></select><select aria-label="关卡池状态" value={poolStatus} onChange={(event) => setPoolStatus(event.target.value as typeof poolStatus)}><option value="unplaced">未编排</option><option value="all">未编排及其他小节</option></select></div><div className="admin-row"><button disabled={!sectionId || !checked.length} onClick={() => place(checked, sectionId)}>批量加入 ({checked.length})</button><button onClick={() => setChecked(pool.map((item) => item.id))}>全选当前结果 ({pool.length})</button><button onClick={() => setChecked([])}>清空选择</button></div><div className="admin-pool-list">{pool.map((item) => <article key={item.id}><input type="checkbox" aria-label={`选择 ${item.id}`} checked={checked.includes(item.id)} onChange={(event) => setChecked((previous) => event.target.checked ? [...previous, item.id] : previous.filter((id) => id !== item.id))} /><LevelThumbnail colors={item.colors} mode={item.mode} radius={item.radius} /><span>{item.title} · {item.mode}<small> · {item.id}{placed(item.id) ? ` · ${content.sections.find((sec) => sec.id === placed(item.id)?.sectionId)?.title}` : ""}</small></span><button disabled={!sectionId} onClick={() => place([item.id], sectionId)}>{placed(item.id) ? "移动到本小节" : "加入本小节"}</button></article>)}</div></section>
      </>}
    </div>
  </div>;
}
