import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { TaxonomyNodeTree, TaxonomyNodeStatus } from '../../types';
import { 
  FolderTree, ChevronRight, ChevronDown, Plus, Edit2, Move, 
  Archive, RotateCcw, Trash2, ShieldCheck, Sparkles, Folder, 
  FolderOpen, AlertCircle, X, Check, ArrowRight
} from 'lucide-react';

interface TaxonomyTreeManagerProps {
  userRole?: string;
  onTreeChanged?: () => void;
}

export const TaxonomyTreeManager: React.FC<TaxonomyTreeManagerProps> = ({ 
  userRole = 'coach',
  onTreeChanged 
}) => {
  const [tree, setTree] = useState<TaxonomyNodeTree[]>([]);
  const [loading, setLoading] = useState(true);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState<Set<number>>(new Set());

  // Modal State
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'move' | null>(null);
  const [activeNode, setActiveNode] = useState<TaxonomyNodeTree | null>(null);
  const [targetParentId, setTargetParentId] = useState<number | null>(null);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isAdmin = userRole === 'admin';

  const loadTree = async () => {
    try {
      setLoading(true);
      const data = await api.getTaxonomyTree(includeArchived, includeDeleted && isAdmin);
      setTree(data);
      
      // Auto-expand root level and level 1 on first load
      const autoExpand = new Set<number>();
      data.forEach(root => {
        autoExpand.add(root.id);
        root.children.forEach(c => autoExpand.add(c.id));
      });
      setExpandedNodes(autoExpand);
    } catch (err) {
      console.warn('Failed to load taxonomy tree', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTree();
  }, [includeArchived, includeDeleted]);

  const toggleExpand = (nodeId: number) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  const handleOpenCreateChild = (parent: TaxonomyNodeTree) => {
    setActiveNode(parent);
    setTargetParentId(parent.id);
    setFormName('');
    setFormDesc('');
    setErrorMsg(null);
    setModalMode('create');
  };

  const handleOpenCreateRoot = () => {
    setActiveNode(null);
    setTargetParentId(null);
    setFormName('');
    setFormDesc('');
    setErrorMsg(null);
    setModalMode('create');
  };

  const handleOpenEdit = (node: TaxonomyNodeTree) => {
    setActiveNode(node);
    setFormName(node.name);
    setFormDesc(node.description || '');
    setErrorMsg(null);
    setModalMode('edit');
  };

  const handleOpenMove = (node: TaxonomyNodeTree) => {
    setActiveNode(node);
    setTargetParentId(node.parent_id || null);
    setErrorMsg(null);
    setModalMode('move');
  };

  const handleModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() && modalMode !== 'move') return;
    setSubmitting(true);
    setErrorMsg(null);

    try {
      if (modalMode === 'create') {
        await api.createTaxonomyNode({
          name: formName.trim(),
          description: formDesc.trim() || undefined,
          parent_id: targetParentId || undefined
        });
      } else if (modalMode === 'edit' && activeNode) {
        await api.updateTaxonomyNode(activeNode.id, {
          name: formName.trim(),
          description: formDesc.trim() || undefined
        });
      } else if (modalMode === 'move' && activeNode) {
        await api.moveTaxonomyNode(activeNode.id, targetParentId);
      }

      await loadTree();
      setModalMode(null);
      if (onTreeChanged) onTreeChanged();
    } catch (err: any) {
      setErrorMsg(err.message || 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleArchive = async (node: TaxonomyNodeTree) => {
    if (!confirm(`Archive "${node.name}"? It will be hidden from new schedule selections.`)) return;
    try {
      await api.archiveTaxonomyNode(node.id);
      await loadTree();
      if (onTreeChanged) onTreeChanged();
    } catch (err: any) {
      alert(`Error archiving node: ${err.message}`);
    }
  };

  const handleRestore = async (node: TaxonomyNodeTree) => {
    try {
      await api.restoreTaxonomyNode(node.id);
      await loadTree();
      if (onTreeChanged) onTreeChanged();
    } catch (err: any) {
      alert(`Error restoring node: ${err.message}`);
    }
  };

  const handleDelete = async (node: TaxonomyNodeTree) => {
    if (!confirm(`Soft-delete "${node.name}" and all its sub-branches?`)) return;
    try {
      await api.deleteTaxonomyNode(node.id);
      await loadTree();
      if (onTreeChanged) onTreeChanged();
    } catch (err: any) {
      alert(`Error deleting node: ${err.message}`);
    }
  };

  const handleRecover = async (node: TaxonomyNodeTree) => {
    try {
      await api.recoverTaxonomyNode(node.id);
      await loadTree();
      if (onTreeChanged) onTreeChanged();
    } catch (err: any) {
      alert(`Error recovering node: ${err.message}`);
    }
  };

  // Helper to get flat list for move selector
  const getAllNodesFlat = (nodes: TaxonomyNodeTree[]): TaxonomyNodeTree[] => {
    let list: TaxonomyNodeTree[] = [];
    for (const n of nodes) {
      list.push(n);
      if (n.children && n.children.length > 0) {
        list = list.concat(getAllNodesFlat(n.children));
      }
    }
    return list;
  };

  const allFlatNodes = getAllNodesFlat(tree);

  const renderTreeNode = (node: TaxonomyNodeTree, level: number = 0) => {
    const isExpanded = expandedNodes.has(node.id);
    const hasChildren = node.children && node.children.length > 0;
    const isArchived = node.status === 'archived';
    const isDeleted = node.status === 'soft_deleted';

    return (
      <div key={node.id} className="space-y-1">
        <div 
          className={`flex items-center justify-between p-2.5 rounded-2xl transition-all group ${
            isDeleted 
              ? 'bg-rose-950/20 border border-rose-500/20 opacity-70' 
              : isArchived
              ? 'bg-slate-900/50 border border-slate-800/60 opacity-75'
              : 'bg-slate-900/90 border border-slate-800 hover:border-rowing-500/40 shadow-sm'
          }`}
          style={{ marginLeft: `${level * 20}px` }}
        >
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            {/* Expand / Collapse Icon */}
            {hasChildren ? (
              <button
                type="button"
                onClick={() => toggleExpand(node.id)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                {isExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
              </button>
            ) : (
              <span className="w-5 text-center text-slate-600 font-mono text-xs">•</span>
            )}

            {/* Folder / Branch Icon */}
            {isExpanded ? (
              <FolderOpen className="w-4 h-4 text-amber-400 shrink-0" />
            ) : (
              <Folder className="w-4 h-4 text-rowing-400 shrink-0" />
            )}

            {/* Node Info */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs font-bold ${isDeleted ? 'line-through text-rose-300' : 'text-white'}`}>
                  {node.name}
                </span>

                {isArchived && (
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300">
                    Archived
                  </span>
                )}
                {isDeleted && (
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-500/20 text-rose-300">
                    Deleted
                  </span>
                )}
                {hasChildren && (
                  <span className="text-[10px] text-slate-500">
                    ({node.children.length} {node.children.length === 1 ? 'branch' : 'branches'})
                  </span>
                )}
              </div>

              {node.description && (
                <p className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">
                  {node.description}
                </p>
              )}
            </div>
          </div>

          {/* Action Buttons Toolbar */}
          <div className="flex items-center gap-1 opacity-90 group-hover:opacity-100 transition-opacity shrink-0 ml-2">
            {!isDeleted && (
              <>
                <button
                  type="button"
                  onClick={() => handleOpenCreateChild(node)}
                  title="Add child branch under this node"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rowing-300 hover:bg-slate-800 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenEdit(node)}
                  title="Edit node name & description"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenMove(node)}
                  title="Move node to new parent"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-sky-300 hover:bg-slate-800 transition-colors"
                >
                  <Move className="w-3.5 h-3.5" />
                </button>

                {isArchived ? (
                  <button
                    type="button"
                    onClick={() => handleRestore(node)}
                    title="Restore archived node"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-300 hover:bg-slate-800 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleArchive(node)}
                    title="Archive node (exclude from new schedules)"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-amber-300 hover:bg-slate-800 transition-colors"
                  >
                    <Archive className="w-3.5 h-3.5" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleDelete(node)}
                  title="Soft-delete node"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}

            {isDeleted && isAdmin && (
              <button
                type="button"
                onClick={() => handleRecover(node)}
                title="Recover deleted node (Admin only)"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30"
              >
                <RotateCcw className="w-3 h-3" /> Recover
              </button>
            )}
          </div>
        </div>

        {/* Render Child Sub-Branches Recursively */}
        {hasChildren && isExpanded && (
          <div className="space-y-1 border-l border-slate-800/80 ml-3">
            {node.children.map(child => renderTreeNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <FolderTree className="w-5 h-5 text-rowing-400" />
            <h3 className="text-base sm:text-lg font-extrabold text-white">
              Boathouse Training Taxonomy & Periodization Tree
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure unlimited-depth training phases, energy systems (UT2, AT, TR, AN), and workout branches.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Include Archived toggle */}
          <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
              className="rounded text-rowing-500 bg-slate-950 border-slate-700"
            />
            <span>Show Archived</span>
          </label>

          {/* Include Deleted toggle (Admin only) */}
          {isAdmin && (
            <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl">
              <input
                type="checkbox"
                checked={includeDeleted}
                onChange={(e) => setIncludeDeleted(e.target.checked)}
                className="rounded text-rose-500 bg-slate-950 border-slate-700"
              />
              <span>Show Deleted</span>
            </label>
          )}

          <button
            type="button"
            onClick={handleOpenCreateRoot}
            className="px-4 py-2 bg-gradient-to-r from-rowing-600 to-rowing-500 hover:from-rowing-500 hover:to-rowing-400 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-md transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Add Root Branch</span>
          </button>
        </div>
      </div>

      {/* Tree Content */}
      {loading ? (
        <div className="p-8 text-center text-xs text-slate-500 animate-pulse">
          Loading taxonomy tree...
        </div>
      ) : tree.length === 0 ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-8 text-center space-y-3">
          <FolderTree className="w-10 h-10 text-slate-600 mx-auto" />
          <h4 className="text-sm font-bold text-white">No Taxonomy Branches Configured</h4>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Create your first periodization or training category root node to start building your club's training hierarchy.
          </p>
          <button
            type="button"
            onClick={handleOpenCreateRoot}
            className="px-4 py-2 bg-rowing-600 text-white font-bold text-xs rounded-xl"
          >
            Create First Root Branch
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {tree.map(root => renderTreeNode(root, 0))}
        </div>
      )}

      {/* Node Create / Edit / Move Modal */}
      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto">
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl text-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-rowing-500/20 text-rowing-400 flex items-center justify-center">
                  {modalMode === 'move' ? <Move className="w-4 h-4" /> : <FolderTree className="w-4 h-4" />}
                </div>
                <h3 className="text-sm font-bold text-white">
                  {modalMode === 'create' && (targetParentId ? `Add Sub-Branch under "${activeNode?.name}"` : 'Add New Root Branch')}
                  {modalMode === 'edit' && `Edit "${activeNode?.name}"`}
                  {modalMode === 'move' && `Move "${activeNode?.name}"`}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalMode(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {errorMsg && (
              <div className="mt-3 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleModalSubmit} className="space-y-3.5 pt-4">
              {modalMode !== 'move' ? (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Branch Name</label>
                    <input
                      type="text"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="e.g. Aerobic Threshold (AT)"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Description (Optional)</label>
                    <textarea
                      rows={2}
                      value={formDesc}
                      onChange={(e) => setFormDesc(e.target.value)}
                      placeholder="e.g. Heart rate zone 160-175 bpm, stroke rate 24-28."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Select New Parent Node</label>
                  <p className="text-[11px] text-slate-400 mb-2">
                    Cycles are automatically detected and prevented.
                  </p>
                  <select
                    value={targetParentId === null ? '' : targetParentId}
                    onChange={(e) => setTargetParentId(e.target.value === '' ? null : Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="">(Make Root Level - No Parent)</option>
                    {allFlatNodes
                      .filter(n => n.id !== activeNode?.id)
                      .map(n => (
                        <option key={n.id} value={n.id}>
                          {n.full_path}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalMode(null)}
                  className="px-3 py-2 text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-rowing-600 hover:bg-rowing-500 text-white font-bold text-xs shadow-lg transition-all"
                >
                  {submitting ? 'Saving...' : modalMode === 'move' ? 'Move Branch' : 'Save Branch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
