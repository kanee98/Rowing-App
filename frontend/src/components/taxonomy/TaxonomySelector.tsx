import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../services/api';
import { TaxonomyNode } from '../../types';
import { 
  GitBranch, Search, ChevronRight, Check, Plus, 
  FolderTree, Sparkles, X, ChevronDown 
} from 'lucide-react';

interface TaxonomySelectorProps {
  selectedNodeId?: number | null;
  onSelectNode: (node: TaxonomyNode | null) => void;
  label?: string;
  placeholder?: string;
  allowQuickCreate?: boolean;
}

export const TaxonomySelector: React.FC<TaxonomySelectorProps> = ({
  selectedNodeId,
  onSelectNode,
  label = 'Periodization & Category Branch',
  placeholder = 'Select training taxonomy phase / branch...',
  allowQuickCreate = true
}) => {
  const [nodes, setNodes] = useState<TaxonomyNode[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState<TaxonomyNode | null>(null);

  // Quick create inline state
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [quickName, setQuickName] = useState('');
  const [quickParentId, setQuickParentId] = useState<number | undefined>(undefined);
  const [creating, setCreating] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  const loadNodes = async () => {
    try {
      setLoading(true);
      const list = await api.getTaxonomyNodes();
      setNodes(list);
      if (selectedNodeId) {
        const match = list.find(n => n.id === selectedNodeId);
        if (match) setSelectedNode(match);
      }
    } catch (e) {
      console.warn('Failed to load taxonomy nodes:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNodes();
  }, [selectedNodeId]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (node: TaxonomyNode | null) => {
    setSelectedNode(node);
    onSelectNode(node);
    setIsOpen(false);
    setSearch('');
  };

  const handleQuickCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickName.trim()) return;
    setCreating(true);
    try {
      const created = await api.createTaxonomyNode({
        name: quickName.trim(),
        parent_id: quickParentId || (selectedNode ? selectedNode.id : undefined)
      });
      await loadNodes();
      handleSelect(created);
      setShowQuickCreate(false);
      setQuickName('');
    } catch (err: any) {
      alert(`Error creating taxonomy node: ${err.message}`);
    } finally {
      setCreating(false);
    }
  };

  const filteredNodes = nodes.filter(n => {
    const term = search.toLowerCase();
    const nameMatch = n.name.toLowerCase().includes(term);
    const pathMatch = (n.full_path || '').toLowerCase().includes(term);
    return nameMatch || pathMatch;
  });

  return (
    <div className="relative space-y-1.5" ref={containerRef}>
      {label && (
        <label className="block text-xs font-semibold text-slate-300">
          {label}
        </label>
      )}

      {/* Main Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-left text-white flex items-center justify-between gap-2 transition-all focus:outline-none focus:ring-1 focus:ring-rowing-500"
      >
        <div className="flex items-center gap-2 min-w-0">
          <FolderTree className="w-4 h-4 text-rowing-400 shrink-0" />
          {selectedNode ? (
            <div className="flex items-center gap-1.5 truncate">
              <span className="font-bold text-slate-100">{selectedNode.name}</span>
              {selectedNode.full_path && (
                <span className="text-[10px] text-slate-400 truncate hidden sm:inline">
                  ({selectedNode.full_path})
                </span>
              )}
            </div>
          ) : (
            <span className="text-slate-500 truncate">{placeholder}</span>
          )}
        </div>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute left-0 right-0 mt-1 bg-slate-900 border border-slate-800 rounded-2xl p-2.5 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150 space-y-2">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search taxonomy branch or sub-phase..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rowing-500"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-2 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Node List */}
          <div className="max-h-56 overflow-y-auto space-y-1 py-1">
            {/* None / Clear Option */}
            <button
              type="button"
              onClick={() => handleSelect(null)}
              className="w-full flex items-center justify-between p-2 rounded-lg text-xs text-slate-400 hover:bg-slate-800/80 hover:text-white transition-colors"
            >
              <span>(No Taxonomy Node / Uncategorized)</span>
              {!selectedNode && <Check className="w-3.5 h-3.5 text-rowing-400" />}
            </button>

            {filteredNodes.length === 0 ? (
              <div className="py-4 text-center text-xs text-slate-500">
                No matching taxonomy branches found.
              </div>
            ) : (
              filteredNodes.map((n) => {
                const isSelected = selectedNode?.id === n.id;
                const pathParts = (n.full_path || n.name).split(' / ');

                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => handleSelect(n)}
                    className={`w-full flex items-start justify-between p-2 rounded-xl text-xs transition-all text-left group ${
                      isSelected
                        ? 'bg-rowing-500/20 text-rowing-300 border border-rowing-500/30'
                        : 'hover:bg-slate-800/80 text-slate-200'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      {/* Breadcrumbs trail */}
                      {pathParts.length > 1 && (
                        <div className="flex items-center gap-1 text-[10px] text-slate-400 mb-0.5 truncate font-mono">
                          {pathParts.slice(0, -1).map((part, idx) => (
                            <React.Fragment key={idx}>
                              <span>{part}</span>
                              <ChevronRight className="w-2.5 h-2.5 text-slate-600 shrink-0" />
                            </React.Fragment>
                          ))}
                        </div>
                      )}
                      <div className="font-bold text-xs flex items-center gap-1.5">
                        <GitBranch className="w-3.5 h-3.5 text-rowing-400 shrink-0" />
                        <span>{n.name}</span>
                      </div>
                      {n.description && (
                        <p className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">
                          {n.description}
                        </p>
                      )}
                    </div>

                    {isSelected && (
                      <Check className="w-4 h-4 text-rowing-400 shrink-0 ml-2 mt-1" />
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Quick Add Sub-Category Footer */}
          {allowQuickCreate && (
            <div className="border-t border-slate-800 pt-2">
              {!showQuickCreate ? (
                <button
                  type="button"
                  onClick={() => setShowQuickCreate(true)}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-rowing-400 hover:text-rowing-300 font-semibold"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add New Sub-Phase / Branch</span>
                </button>
              ) : (
                <form onSubmit={handleQuickCreateSubmit} className="space-y-2 p-1 bg-slate-950 rounded-xl border border-slate-800">
                  <div className="flex items-center justify-between text-[11px] text-slate-300 font-semibold">
                    <span>Quick Create Branch</span>
                    <button
                      type="button"
                      onClick={() => setShowQuickCreate(false)}
                      className="text-slate-500 hover:text-white"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <input
                    type="text"
                    value={quickName}
                    onChange={(e) => setQuickName(e.target.value)}
                    placeholder="Branch name (e.g. 500m Sprints)"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white"
                    required
                  />
                  <div className="flex items-center justify-between gap-2">
                    <select
                      value={quickParentId || ''}
                      onChange={(e) => setQuickParentId(e.target.value ? Number(e.target.value) : undefined)}
                      className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-[10px] text-slate-300 max-w-[160px]"
                    >
                      <option value="">Root Level</option>
                      {nodes.map((n) => (
                        <option key={n.id} value={n.id}>
                          Under: {n.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      disabled={creating}
                      className="px-3 py-1 bg-rowing-600 hover:bg-rowing-500 text-white font-bold rounded-lg text-xs"
                    >
                      {creating ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
