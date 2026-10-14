async function test() {
    const visited = new Set();
    const failures = [];
    async function fetchModule(url) {
        if (visited.has(url)) return;
        visited.add(url);
        try {
            const res = await fetch('http://localhost:5173' + url);
            if (!res.ok) {
                failures.push({ url, status: res.status });
                console.error('FAIL:', url, res.status);
                return;
            }
            const text = await res.text();
            // find static and dynamic imports
            const re = /(?:import|from)\s+['"]([^'"]+)['"]/g;
            let m;
            while ((m = re.exec(text)) !== null) {
                let dep = m[1];
                if (dep.startsWith('./') || dep.startsWith('../')) {
                    const dir = url.slice(0, url.lastIndexOf('/') + 1);
                    const resolved = new URL(dep, 'http://localhost:5173' + dir).pathname;
                    await fetchModule(resolved);
                } else if (dep.startsWith('/')) {
                    await fetchModule(dep);
                }
            }
        } catch (e) {
            failures.push({ url, error: e.message });
            console.error('ERROR:', url, e.message);
        }
    }

    await fetchModule('/index.jsx');
    console.log('Visited:', visited.size, 'Failures:', failures);
}
test().catch(console.error);
