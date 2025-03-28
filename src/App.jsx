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
    selectedProject: null
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch('/project-graph.json');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        if (!data || !data.nodes || !data.dependencies) throw new Error('Invalid project graph data format');
        setProjectGraph(data);
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

  const allTags = [...new Set(projects.flatMap(p => (nodes[p].data.tags || []).filter(tag => !tag.startsWith('npm:'))))];
  const targets = new Set(Object.values(dependencies).flatMap(deps => deps.map(dep => dep.target)));

  const filteredProjects = projects.filter(project => {
    const depCount = dependencies[project]?.length || 0;
    const depntCount = dependentsCount[project] || 0;
    const projectData = nodes[project];
    return (
        depCount >= filters.minDependencies &&
        (filters.maxDependencies === Infinity || depCount <= filters.maxDependencies) &&
        depntCount >= filters.minDependents &&
        (filters.maxDependents === Infinity || depntCount <= filters.maxDependents) &&
        (filters.selectedTags.length === 0 || (projectData.data.tags || []).some(tag => filters.selectedTags.includes(tag)))
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

  return (
      <div className="container">
        <header className="header">
          <h1>Package Graph Analyzer</h1>
        </header>

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
        </section>

        <section className="results">
          <h2>Results ({sortedProjects.length} packages)</h2>
          <div className="metrics">
            <span>No dependencies: {sortedProjects.filter(p => !dependencies[p] || dependencies[p].length === 0).length}</span>
            <span>Avg dependencies: {(sortedProjects.reduce((sum, p) => sum + (dependencies[p]?.length || 0), 0) / (sortedProjects.length || 1)).toFixed(2)}</span>
            <span>No dependents: {sortedProjects.filter(p => !targets.has(p)).length}</span>
            <span>Avg dependents: {(sortedProjects.reduce((sum, p) => sum + (dependentsCount[p] || 0), 0) / (sortedProjects.length || 1)).toFixed(2)}</span>
          </div>
          <table>
            <thead>
            <tr>
              <th>Package</th>
              <th>Dependencies</th>
              <th>Dependents</th>
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