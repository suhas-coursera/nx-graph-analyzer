import React, { useState, useEffect } from 'react';
import './App.css';

const App = () => {
  const [projectGraph, setProjectGraph] = useState(null);
  const [filters, setFilters] = useState({
    minDependencies: 0,
    maxDependencies: Infinity,
    minDependents: 0,
    maxDependents: Infinity,
    selectedTags: [],
    selectedProject: null,
    showCyclesOnly: false
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentCycleIndex, setCurrentCycleIndex] = useState(0);
  const [resolvedCycles, setResolvedCycles] = useState(new Set());

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch('/project-graph.json');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        if (!data || !data.nodes || !data.dependencies) throw new Error('Invalid project graph data format');

        const cleanedData = {
          nodes: { ...data.nodes },
          dependencies: { ...data.dependencies }
        };
        delete cleanedData.nodes['coursera-web'];
        delete cleanedData.dependencies['coursera-web'];
        Object.keys(cleanedData.dependencies).forEach(project => {
          cleanedData.dependencies[project] = cleanedData.dependencies[project].filter(
              dep => dep.target !== 'coursera-web'
          );
        });

        setProjectGraph(cleanedData);
      } catch (err) {
        setError(err.message || 'Failed to load project graph data');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  if (loading) return <div className="container loading">Loading project data...</div>;
  if (error) return (
      <div className="container error">
        <div className="error-message">Error: {error}</div>
        <button className="retry-button" onClick={() => window.location.reload()}>Retry</button>
      </div>
  );
  if (!projectGraph) return <div className="container">No project data available</div>;

  const { nodes, dependencies } = projectGraph;
  const projects = Object.keys(nodes);
  const dependentsCount = {};
  projects.forEach(project => { dependentsCount[project] = 0; });
  Object.entries(dependencies).forEach(([project, deps]) => {
    deps.forEach(dep => { dependentsCount[dep.target] = (dependentsCount[dep.target] || 0) + 1; });
  });

  const calculateMetrics = () => {
    const depth = {};
    const cycles = [];
    const cyclePaths = {};
    const visited = new Set();
    const recursionStack = new Set();
    const path = {};

    const dfs = (node, currentPath) => {
      if (recursionStack.has(node)) {
        const cycleStart = currentPath.indexOf(node);
        const cycle = currentPath.slice(cycleStart);
        const cycleKey = cycle.join(' -> ');
        if (!cycles.some(c => c.join(' -> ') === cycleKey)) {
          cycles.push(cycle);
          cyclePaths[node] = cycleKey;
        }
        return 0;
      }
      if (visited.has(node)) return depth[node] || 0;

      visited.add(node);
      recursionStack.add(node);
      path[node] = currentPath;

      const deps = dependencies[node] || [];
      let maxDepth = 0;
      deps.forEach(dep => {
        maxDepth = Math.max(maxDepth, 1 + dfs(dep.target, [...currentPath, dep.target]));
      });

      recursionStack.delete(node);
      depth[node] = maxDepth;
      return maxDepth;
    };

    projects.forEach(project => {
      if (!visited.has(project)) {
        dfs(project, [project]);
      }
    });

    return { depth, cycles, cyclePaths };
  };

  const { depth, cycles, cyclePaths } = calculateMetrics();
  const unresolvedCycles = cycles.filter(cycle => !resolvedCycles.has(cycle.join(' -> ')));

  // Get project type based on tags
  const getProjectType = (project) => {
    const tags = nodes[project]?.data.tags || [];
    if (tags.includes('app')) return 'app';
    if (tags.includes('shared')) return 'shared';
    if (tags.includes('lib')) return 'lib';
    return 'unknown';
  };

  // Suggest link to break respecting layering policies
  const suggestLinkToBreak = (cycle) => {
    // Policy violations take priority
    for (let i = 0; i < cycle.length; i++) {
      const from = cycle[i];
      const to = cycle[(i + 1) % cycle.length];
      const fromType = getProjectType(from);
      const toType = getProjectType(to);

      // Policy 1: No shared/lib -> app
      if ((fromType === 'shared' || fromType === 'lib') && toType === 'app') {
        return { from, to, reason: `${fromType} should not depend on app` };
      }

      // Policy 2: No lib -> app/shared
      if (fromType === 'lib' && (toType === 'app' || toType === 'shared')) {
        return { from, to, reason: `lib should not depend on ${toType}` };
      }
    }

    // If no policy violations, fall back to least dependents
    let minDependents = Infinity;
    let suggestedLink = null;
    for (let i = 0; i < cycle.length; i++) {
      const from = cycle[i];
      const to = cycle[(i + 1) % cycle.length];
      const dependents = dependentsCount[to] || 0;
      if (dependents < minDependents) {
        minDependents = dependents;
        suggestedLink = { from, to, reason: `Least dependents (${dependents})` };
      }
    }
    return suggestedLink;
  };

  const modularityScore = project => {
    const depCount = dependencies[project]?.length || 0;
    const depntCount = dependentsCount[project] || 0;
    return ((depCount + depntCount) / (projects.length || 1)).toFixed(2);
  };

  const allTags = [...new Set(projects.flatMap(p => (nodes[p].data.tags || []).filter(tag => !tag.startsWith('npm:'))))];
  const targets = new Set(Object.values(dependencies).flatMap(deps => deps.map(dep => dep.target)));

  const filteredProjects = projects.filter(project => {
    const depCount = dependencies[project]?.length || 0;
    const depntCount = dependentsCount[project] || 0;
    const projectData = nodes[project];
    const inCycle = cycles.some(cycle => cycle.includes(project));
    return (
        depCount >= filters.minDependencies &&
        (filters.maxDependencies === Infinity || depCount <= filters.maxDependencies) &&
        depntCount >= filters.minDependents &&
        (filters.maxDependents === Infinity || depntCount <= filters.maxDependents) &&
        (filters.selectedTags.length === 0 || (projectData.data.tags || []).some(tag => filters.selectedTags.includes(tag))) &&
        (!filters.showCyclesOnly || inCycle)
    );
  });

  const sortedProjects = filteredProjects.sort((a, b) => {
    const depA = dependencies[a]?.length || 0;
    const depB = dependencies[b]?.length || 0;
    if (depA !== depB) return depA - depB;

    const depntA = dependentsCount[a] || 0;
    const depntB = dependentsCount[b] || 0;
    if (depntA !== depntB) return depntA - depntB;

    const tagsA = (nodes[a].data.tags || []).filter(tag => !tag.startsWith('npm:')).join(', ');
    const tagsB = (nodes[b].data.tags || []).filter(tag => !tag.startsWith('npm:')).join(', ');
    return tagsA.localeCompare(tagsB);
  });

  const updateFilter = (key, value) => setFilters(prev => ({ ...prev, [key]: value }));

  const resolveCycle = (cycle) => {
    const cycleKey = cycle.join(' -> ');
    setResolvedCycles(prev => new Set([...prev, cycleKey]));
    setCurrentCycleIndex(Math.min(currentCycleIndex, unresolvedCycles.length - 2));
  };

  const exportData = () => {
    const csv = [
      ['Package', 'Dependencies', 'Dependents', 'Depth', 'In Cycle', 'Cycle Path', 'Modularity', 'Tags'],
      ...sortedProjects.map(project => [
        project,
        dependencies[project]?.length || 0,
        dependentsCount[project] || 0,
        depth[project],
        cycles.some(c => c.includes(project)) ? 'Yes' : 'No',
        cyclePaths[project] || '',
        modularityScore(project),
        `"${(nodes[project].data.tags || []).filter(tag => !tag.startsWith('npm:')).join(', ')}"`
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'project_graph_analysis.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const currentCycle = unresolvedCycles[currentCycleIndex] || [];
  const suggestedLink = currentCycle.length ? suggestLinkToBreak(currentCycle) : null;

  return (
      <div className="container">
        <header className="header">
          <h1>Package Graph Analyzer</h1>
          <div>
            <span className="progress">Cycles Remaining: {unresolvedCycles.length} / {cycles.length}</span>
            <button className="export-button" onClick={exportData}>Export CSV</button>
          </div>
        </header>

        <section className="cycle-navigator">
          {unresolvedCycles.length > 0 && (
              <>
                <h3>Current Cycle ({currentCycleIndex + 1}/{unresolvedCycles.length})</h3>
                <div className="cycle-info">
                  <p>Path: {currentCycle.join(' -> ')}</p>
                  <p>Suggested Break: {suggestedLink ? `${suggestedLink.from} -> ${suggestedLink.to}` : 'None'}</p>
                  {suggestedLink && <p>Reason: {suggestedLink.reason}</p>}
                  <button
                      className="action-button"
                      onClick={() => resolveCycle(currentCycle)}
                  >
                    Mark as Resolved
                  </button>
                  <button
                      className="action-button"
                      onClick={() => setCurrentCycleIndex(prev => Math.min(prev + 1, unresolvedCycles.length - 1))}
                      disabled={currentCycleIndex === unresolvedCycles.length - 1}
                  >
                    Next Cycle
                  </button>
                </div>
              </>
          )}
          {unresolvedCycles.length === 0 && <p className="success">All cycles resolved!</p>}
        </section>

        <section className="filters">
          <div className="filter-card">
            <h3>Dependencies</h3>
            <label>Min: <input type="number" value={filters.minDependencies} onChange={e => updateFilter('minDependencies', Number(e.target.value))} min="0" /></label>
            <label>Max: <input type="number" value={filters.maxDependencies === Infinity ? '' : filters.maxDependencies} onChange={e => updateFilter('maxDependencies', e.target.value === '' ? Infinity : Number(e.target.value))} min="0" /></label>
          </div>
          <div className="filter-card">
            <h3>Dependents</h3>
            <label>Min: <input type="number" value={filters.minDependents} onChange={e => updateFilter('minDependents', Number(e.target.value))} min="0" /></label>
            <label>Max: <input type="number" value={filters.maxDependents === Infinity ? '' : filters.maxDependents} onChange={e => updateFilter('maxDependents', e.target.value === '' ? Infinity : Number(e.target.value))} min="0" /></label>
          </div>
          <div className="filter-card">
            <h3>Tags</h3>
            {allTags.map(tag => (
                <label key={tag}>
                  <input type="checkbox" checked={filters.selectedTags.includes(tag)} onChange={e => updateFilter('selectedTags', e.target.checked ? [...filters.selectedTags, tag] : filters.selectedTags.filter(t => t !== tag))} />
                  {tag}
                </label>
            ))}
          </div>
          <div className="filter-card">
            <h3>Cycles</h3>
            <label>
              <input type="checkbox" checked={filters.showCyclesOnly} onChange={e => updateFilter('showCyclesOnly', e.target.checked)} />
              Show only projects in cycles
            </label>
          </div>
        </section>

        <section className="results">
          <h2>Results ({sortedProjects.length} packages)</h2>
          <div className="metrics">
            <span>No dependencies: {sortedProjects.filter(p => !dependencies[p] || dependencies[p].length === 0).length}</span>
            <span>Avg dependencies: {(sortedProjects.reduce((sum, p) => sum + (dependencies[p]?.length || 0), 0) / (sortedProjects.length || 1)).toFixed(2)}</span>
            <span>No dependents: {sortedProjects.filter(p => !targets.has(p)).length}</span>
            <span>Avg dependents: {(sortedProjects.reduce((sum, p) => sum + (dependentsCount[p] || 0), 0) / (sortedProjects.length || 1)).toFixed(2)}</span>
            <span>In cycles: {sortedProjects.filter(p => cycles.some(c => c.includes(p))).length}</span>
          </div>
          <table>
            <thead>
            <tr>
              <th>Package</th>
              <th>Dependencies</th>
              <th>Dependents</th>
              <th>Depth</th>
              <th>In Cycle</th>
              <th>Cycle Path</th>
              <th>Modularity</th>
              <th>Tags</th>
            </tr>
            </thead>
            <tbody>
            {sortedProjects.map(project => (
                <tr key={project} onClick={() => updateFilter('selectedProject', project)} className={filters.selectedProject === project ? 'selected' : ''}>
                  <td>{project}</td>
                  <td className="hoverable">
                    {dependencies[project]?.length || 0}
                    {dependencies[project]?.length > 0 && (
                        <div className="popup">
                          {dependencies[project].map(dep => dep.target).join('\n')}
                        </div>
                    )}
                  </td>
                  <td className="hoverable">
                    {dependentsCount[project] || 0}
                    {dependentsCount[project] > 0 && (
                        <div className="popup">
                          {Object.entries(dependencies)
                              .filter(([_, deps]) => deps.some(dep => dep.target === project))
                              .map(([proj]) => proj)
                              .join('\n')}
                        </div>
                    )}
                  </td>
                  <td>{depth[project]}</td>
                  <td>{cycles.some(c => c.includes(project)) ? 'Yes' : 'No'}</td>
                  <td className="hoverable">
                    {cyclePaths[project] ? 'Yes' : '-'}
                    {cyclePaths[project] && (
                        <div className="popup">
                          {cyclePaths[project]}
                        </div>
                    )}
                  </td>
                  <td>{modularityScore(project)}</td>
                  <td>{(nodes[project].data.tags || []).filter(tag => !tag.startsWith('npm:')).join(', ')}</td>
                </tr>
            ))}
            </tbody>
          </table>
        </section>
      </div>
  );
};

export default App;