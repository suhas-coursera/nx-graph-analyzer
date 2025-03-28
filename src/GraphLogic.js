import Graph from 'react-vis-network-graph';

export const buildGraphData = (selectedProject, dependencies, dependentsCount, nodes) => {
    if (!selectedProject) return { nodes: [], edges: [] };

    const projectDeps = dependencies[selectedProject] || [];
    const projectDependents = Object.entries(dependencies)
        .filter(([_, deps]) => deps.some(dep => dep.target === selectedProject))
        .map(([project]) => project);

    // Track unique node IDs and edge connections
    const uniqueNodeIds = new Set();
    const nodesList = [];
    const uniqueEdges = new Set(); // To avoid duplicate edges
    const edgesList = [];

    // Helper function to add a node if it’s not already added
    const addNode = (id, label, title, color, shape = 'dot', size = 20) => {
        if (!uniqueNodeIds.has(id)) {
            uniqueNodeIds.add(id);
            nodesList.push({ id, label, title, color, shape, size });
        } else {
            console.warn(`Duplicate node ID detected: ${id}`);
        }
    };

    // Add selected project
    addNode(
        selectedProject,
        selectedProject,
        `${selectedProject}\nDependencies: ${projectDeps.map(dep => dep.target).join(', ') || 'None'}\nDependents: ${projectDependents.join(', ') || 'None'}`,
        '#00d1b2',
        'diamond',
        30
    );

    // Add dependencies
    projectDeps.forEach(dep => {
        const depId = dep.target;
        const depTitle = nodes[depId]
            ? `${depId}\nDependencies: ${(dependencies[depId] || []).map(d => d.target).join(', ') || 'None'}\nDependents: ${dependentsCount[depId] || 0}`
            : `${depId}\n[External or Missing Node]`;
        addNode(depId, depId, depTitle, '#ff3860');

        // Add edge (only if unique)
        const edgeKey = `${selectedProject}->${depId}`;
        if (!uniqueEdges.has(edgeKey)) {
            uniqueEdges.add(edgeKey);
            edgesList.push({ from: selectedProject, to: depId });
        } else {
            console.warn(`Duplicate edge detected: ${edgeKey}`);
        }
    });

    // Add dependents
    projectDependents.forEach(dep => {
        const depTitle = `${dep}\nDependencies: ${(dependencies[dep] || []).map(d => d.target).join(', ') || 'None'}\nDependents: ${dependentsCount[dep] || 0}`;
        addNode(dep, dep, depTitle, '#3273dc');

        // Add edge (only if unique)
        const edgeKey = `${dep}->${selectedProject}`;
        if (!uniqueEdges.has(edgeKey)) {
            uniqueEdges.add(edgeKey);
            edgesList.push({ from: dep, to: selectedProject });
        } else {
            console.warn(`Duplicate edge detected: ${edgeKey}`);
        }
    });

    // Debug output
    console.log('Generated Nodes:', nodesList);
    console.log('Generated Edges:', edgesList);

    return { nodes: nodesList, edges: edgesList };
};

export { Graph };