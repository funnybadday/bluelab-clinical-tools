import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, FileSpreadsheet, Loader2, Save, Play, Plus, Trash2,
  ChevronDown, ChevronRight, CheckCircle2, AlertCircle, Pencil, X,
  GripVertical,
} from "lucide-react";
import api from "../services/api";
import type { Project, CatalogItem } from "../types";

interface CategoryGroup {
  category: string;
  items: CatalogItem[];
  collapsed: boolean;
}

const SOURCE_BADGES: Record<string, { label: string; color: string }> = {
  none: { label: "固定项目", color: "bg-slate-100 text-slate-500" },
  crf:  { label: "CRF自动提取", color: "bg-emerald-50 text-emerald-600" },
  fill: { label: "根据表格名填充", color: "bg-amber-50 text-amber-600" },
};

interface AddTableForm {
  show: boolean;
  gi: number | null;
  position: number | null;
  tableName: string;
}

const emptyForm: AddTableForm = {
  show: false,
  gi: null,
  position: null,
  tableName: "",
};

export default function CatalogEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<CategoryGroup[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [editingCell, setEditingCell] = useState<{ gi: number; ii: number } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [addForm, setAddForm] = useState<AddTableForm>(emptyForm);
  const [dragState, setDragState] = useState<{
    dragging: { gi: number; ii: number | null } | null;
    overCategory: number | null;
    overIndex: number | null;
  }>({ dragging: null, overCategory: null, overIndex: null });

  const fetchProject = async () => {
    try {
      const res = await api.get(`/projects/${id}`);
      setProject(res.data);
    } catch {} finally {
      setLoading(false);
    }
  };

  const fetchTables = async () => {
    try {
      const res = await api.get(`/projects/${id}/tables`);
      const tables: CatalogItem[] = res.data.tables || [];
      // Group by category
      const map = new Map<string, CatalogItem[]>();
      for (const t of tables) {
        if (!map.has(t.category)) map.set(t.category, []);
        map.get(t.category)!.push(t);
      }
      setGroups(
        Array.from(map.entries()).map(([category, items]) => ({
          category,
          items,
          collapsed: false,
        }))
      );
    } catch (err: any) {
      console.error("加载表格目录失败:", err);
    }
  };

  useEffect(() => {
    fetchProject();
    fetchTables();
  }, [id]);

  const toggleCollapse = (gi: number) => {
    setGroups((prev) => prev.map((g, i) => i === gi ? { ...g, collapsed: !g.collapsed } : g));
  };

  const startEdit = (gi: number, ii: number, currentValue: string) => {
    setEditingCell({ gi, ii });
    setEditValue(currentValue);
  };

  const confirmEdit = () => {
    if (!editingCell) return;
    setGroups((prev) =>
      prev.map((g, gi) =>
        gi === editingCell.gi
          ? {
              ...g,
              items: g.items.map((item, ii) =>
                ii === editingCell.ii ? { ...item, name: editValue } : item
              ),
            }
          : g
      )
    );
    setEditingCell(null);
    setEditValue("");
  };

  const cancelEdit = () => {
    setEditingCell(null);
    setEditValue("");
  };

  const deleteItem = (gi: number, ii: number) => {
    setGroups((prev) =>
      prev.map((g, i) =>
        i === gi ? { ...g, items: g.items.filter((_, j) => j !== ii) } : g
      ).filter((g) => g.items.length > 0) // Remove empty categories
    );
  };

  const showAddForm = (gi: number, position?: number) => {
    setAddForm({
      ...emptyForm,
      show: true,
      gi,
      position: position ?? groups[gi].items.length,
    });
  };

  const confirmAddTable = () => {
    const { gi, position, tableName } = addForm;
    if (gi === null || position === null || !tableName.trim()) return;

    const group = groups[gi];
    const newItem: CatalogItem = {
      category: group.category,
      index: 0,
      name: tableName.trim(),
      data_source: "crf",
    };

    setGroups((prev) =>
      prev.map((g, i) => {
        if (i !== gi) return g;
        const newItems = [...g.items];
        newItems.splice(position, 0, newItem);
        return { ...g, items: newItems };
      })
    );
    setAddForm(emptyForm);
  };

  const addCategory = () => {
    if (!newCategoryName.trim()) return;
    setGroups((prev) => [
      ...prev,
      { category: newCategoryName.trim(), items: [], collapsed: false },
    ]);
    setNewCategoryName("");
    setShowAddCategory(false);
  };

  const deleteCategory = (gi: number) => {
    setGroups((prev) => prev.filter((_, i) => i !== gi));
  };

  const handleDragStart = useCallback((gi: number, ii: number | null, e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", `${gi}-${ii ?? "cat"}`);
    setDragState({ dragging: { gi, ii }, overCategory: null, overIndex: null });
  }, []);

  const handleDragOver = useCallback((gi: number, ii: number | null, e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragState((prev) => ({ ...prev, overCategory: gi, overIndex: ii }));
  }, []);

  const handleDrop = useCallback((toGi: number, toIi: number | null, e: React.DragEvent) => {
    e.preventDefault();
    const data = e.dataTransfer.getData("text/plain");
    const [fromGiStr, fromIiStr] = data.split("-");
    const fromGi = parseInt(fromGiStr);
    const fromIi = fromIiStr === "cat" ? null : parseInt(fromIiStr);

    if (isNaN(fromGi)) return;

    setGroups((prev) => {
      // Category drag
      if (fromIi === null) {
        if (fromGi === toGi) return prev;
        const newGroups = [...prev];
        const [moved] = newGroups.splice(fromGi, 1);
        const insertAt = toGi > fromGi ? toGi - 1 : toGi;
        newGroups.splice(insertAt, 0, moved);
        return newGroups;
      }

      // Item drag
      const item = prev[fromGi]?.items[fromIi];
      if (!item) return prev;

      const newGroups = prev.map((g, i) => {
        if (i === fromGi) {
          return { ...g, items: g.items.filter((_, j) => j !== fromIi) };
        }
        return g;
      });

      const targetGi = toGi >= newGroups.length ? newGroups.length - 1 : toGi;
      const targetIndex = toIi !== null ? toIi : newGroups[targetGi].items.length;

      return newGroups.map((g, i) => {
        if (i === targetGi) {
          const newItems = [...g.items];
          newItems.splice(targetIndex, 0, { ...item, category: g.category });
          return { ...g, items: newItems };
        }
        return g;
      }).filter((g) => g.items.length > 0);
    });

    setDragState({ dragging: null, overCategory: null, overIndex: null });
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragState({ dragging: null, overCategory: null, overIndex: null });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg("");
    try {
      // Flatten groups back to tables array, preserving all fields
      const tables = groups.flatMap((g) =>
        g.items.map((item) => {
          const entry: any = { category: g.category, name: item.name, index: 0 };
          if (item.data_source) entry.data_source = item.data_source;
          if (item.projects) entry.projects = item.projects;
          return entry;
        })
      );
      await api.put(`/projects/${id}/tables`, { tables });
      setSaveMsg("保存成功");
      setTimeout(() => setSaveMsg(""), 2000);
    } catch (err: any) {
      setSaveMsg("保存失败: " + (err.response?.data?.detail || "请重试"));
    } finally {
      setSaving(false);
    }
  };

  const handleGenerate = async () => {
    // Save first, then navigate to phase2
    setSaving(true);
    try {
      const tables = groups.flatMap((g) =>
        g.items.map((item) => {
          const entry: any = { category: g.category, name: item.name, index: 0 };
          if (item.data_source) entry.data_source = item.data_source;
          if (item.projects) entry.projects = item.projects;
          return entry;
        })
      );
      await api.put(`/projects/${id}/tables`, { tables });
      navigate(`/project/${id}/prompts`);
    } catch (err: any) {
      setSaveMsg("保存失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  const totalItems = groups.reduce((sum, g) => sum + g.items.length, 0);

  // 切换单张表的 data_source（用于次要疗效终点分析）
  const toggleItemDataSource = (gi: number, ii: number) => {
    setGroups((prev) =>
      prev.map((g, i) => {
        if (i !== gi) return g;
        return {
          ...g,
          items: g.items.map((item, j) => {
            if (j !== ii) return item;
            const currentSource = item.data_source || "crf";
            const newSource = currentSource === "fill" ? "crf" : "fill";
            return { ...item, data_source: newSource as any };
          }),
        };
      })
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 size={32} className="text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200/70 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/home")}
              className="w-9 h-9 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center">
              <FileSpreadsheet size={18} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">{project?.name}</h1>
              <p className="text-xs text-slate-500">编辑表格目录 · {totalItems} 张表格 · {groups.length} 个分类</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {saveMsg && (
              <span className={`text-sm font-medium ${saveMsg.includes("成功") ? "text-emerald-600" : "text-red-500"}`}>
                {saveMsg}
              </span>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-60"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              保存
            </button>
            <button
              onClick={handleGenerate}
              disabled={saving || totalItems === 0}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Play size={16} /> 预览提取 Prompt
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Info Banner */}
        <div className="mb-6 p-4 rounded-xl bg-blue-50 border border-blue-100 text-sm text-blue-700 flex items-center gap-2">
          <AlertCircle size={16} />
          目录已从 SAP 文档中自动提取。您可以修改表格名称、删除不需要的项目、添加新项目，完成后点击"预览提取 Prompt"查看和编辑 CRF 提取指令。
        </div>

        {/* Category Groups */}
        <div className="space-y-4">
          {groups.map((group, gi) => (
            <div
              key={gi}
              className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${
                dragState.dragging?.gi === gi && dragState.dragging?.ii === null
                  ? "opacity-50"
                  : ""
              } ${
                dragState.overCategory === gi && dragState.overIndex === null
                  ? "border-blue-400 ring-2 ring-blue-100"
                  : "border-slate-200/70"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                handleDragOver(gi, null, e);
              }}
              onDrop={(e) => handleDrop(gi, null, e)}
            >
              {/* Category Header */}
              <div
                className="flex items-center justify-between px-5 py-3.5 bg-slate-50 border-b border-slate-200/70 cursor-pointer select-none"
                onClick={() => toggleCollapse(gi)}
              >
                <div className="flex items-center gap-3">
                  <div
                    draggable
                    onDragStart={(e) => {
                      e.stopPropagation();
                      handleDragStart(gi, null, e);
                    }}
                    onDragEnd={handleDragEnd}
                    className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-slate-200 transition-colors"
                    title="拖拽移动分类"
                  >
                    <GripVertical size={16} className="text-slate-400" />
                  </div>
                  {group.collapsed ? (
                    <ChevronRight size={18} className="text-slate-400" />
                  ) : (
                    <ChevronDown size={18} className="text-slate-400" />
                  )}
                  <h3 className="font-bold text-slate-800">{group.category}</h3>
                  <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                    {group.items.length}
                  </span>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteCategory(gi); }}
                  className="w-7 h-7 rounded-lg hover:bg-red-100 flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors cursor-pointer"
                  title="删除此分类"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {/* Items */}
              {!group.collapsed && (
                <div className="divide-y divide-slate-100">
                  {group.items.map((item, ii) => (
                    <div
                      key={ii}
                      draggable={!item.locked}
                      onDragStart={(e) => handleDragStart(gi, ii, e)}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDragOver(gi, ii, e);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDrop(gi, ii, e);
                      }}
                      className={`flex items-center gap-3 px-5 py-3 hover:bg-slate-50/50 transition-all group ${
                        dragState.dragging?.gi === gi && dragState.dragging?.ii === ii
                          ? "opacity-50 bg-blue-50"
                          : ""
                      } ${
                        dragState.overCategory === gi && dragState.overIndex === ii
                          ? "border-t-2 border-blue-400"
                          : ""
                      }`}
                    >
                      {!item.locked && (
                        <GripVertical
                          size={16}
                          className="text-slate-300 cursor-grab active:cursor-grabbing shrink-0"
                        />
                      )}

                      <span className="text-xs text-slate-400 font-mono w-8 text-right shrink-0">
                        {ii + 1}
                      </span>

                      {editingCell?.gi === gi && editingCell?.ii === ii ? (
                        <div className="flex-1 flex items-center gap-2">
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") confirmEdit();
                              if (e.key === "Escape") cancelEdit();
                            }}
                            autoFocus
                            className="flex-1 px-2 py-1 border border-blue-400 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
                          />
                          <button
                            onClick={confirmEdit}
                            className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center hover:bg-emerald-200 cursor-pointer"
                          >
                            <CheckCircle2 size={14} />
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="w-7 h-7 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center hover:bg-slate-200 cursor-pointer"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <span
                            className={`flex-1 text-sm ${item.locked ? "text-slate-400" : "text-slate-700 cursor-pointer hover:text-blue-600"}`}
                            onClick={() => !item.locked && startEdit(gi, ii, item.name)}
                          >
                            {item.name}
                          </span>
                          {item.data_source && SOURCE_BADGES[item.data_source] && (
                            group.category.includes("次要疗效终点") ? (
                              <button
                                onClick={() => toggleItemDataSource(gi, ii)}
                                className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 cursor-pointer transition-colors ${
                                  item.data_source === "fill"
                                    ? "bg-amber-50 text-amber-600 hover:bg-amber-100"
                                    : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                                }`}
                                title="点击切换数据来源"
                              >
                                {SOURCE_BADGES[item.data_source].label}
                              </button>
                            ) : (
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${SOURCE_BADGES[item.data_source].color}`}>
                                {SOURCE_BADGES[item.data_source].label}
                              </span>
                            )
                          )}
                          {item.locked ? (
                            <span className="text-xs text-slate-400 px-1.5">🔒</span>
                          ) : (
                            <>
                              <button
                                onClick={() => showAddForm(gi, ii + 1)}
                                className="w-7 h-7 rounded-lg hover:bg-blue-100 flex items-center justify-center text-slate-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                                title="在此行后插入"
                              >
                                <Plus size={13} />
                              </button>
                              <button
                                onClick={() => startEdit(gi, ii, item.name)}
                                className="w-7 h-7 rounded-lg hover:bg-blue-100 flex items-center justify-center text-slate-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                              >
                                <Pencil size={13} />
                              </button>
                              <button
                                onClick={() => deleteItem(gi, ii)}
                                className="w-7 h-7 rounded-lg hover:bg-red-100 flex items-center justify-center text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                              >
                                <Trash2 size={13} />
                              </button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  ))}

                  {/* Drop zone at bottom */}
                  <div
                    className={`h-2 transition-all ${
                      dragState.overCategory === gi && dragState.overIndex === group.items.length
                        ? "bg-blue-100"
                        : ""
                    }`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleDragOver(gi, group.items.length, e);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleDrop(gi, group.items.length, e);
                    }}
                  />

                  {/* Add item button */}
                  <button
                    onClick={() => showAddForm(gi)}
                    className="w-full flex items-center gap-2 px-5 py-3 text-sm text-blue-600 hover:bg-blue-50/50 transition-colors cursor-pointer"
                  >
                    <Plus size={16} /> 添加表格
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Add Category */}
        <div className="mt-4">
          {showAddCategory ? (
            <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5">
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addCategory(); }}
                  placeholder="输入分类名称"
                  autoFocus
                  className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
                <button
                  onClick={addCategory}
                  disabled={!newCategoryName.trim()}
                  className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 cursor-pointer disabled:opacity-60"
                >
                  添加
                </button>
                <button
                  onClick={() => { setShowAddCategory(false); setNewCategoryName(""); }}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddCategory(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border-2 border-dashed border-slate-200 text-sm text-slate-500 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50/30 transition-all cursor-pointer"
            >
              <Plus size={18} /> 添加新分类
            </button>
          )}
        </div>
      </main>

      {/* Add Table Modal */}
      {addForm.show && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-slate-900">添加表格</h3>
              <button
                onClick={() => setAddForm(emptyForm)}
                className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6">
              {/* Table Name */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">表格名称</label>
                <input
                  type="text"
                  value={addForm.tableName}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, tableName: e.target.value }))}
                  placeholder="输入表格名称"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
              <button
                onClick={() => setAddForm(emptyForm)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={confirmAddTable}
                disabled={!addForm.tableName.trim()}
                className="px-5 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 cursor-pointer disabled:opacity-60"
              >
                确认添加
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
