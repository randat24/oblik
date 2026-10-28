export const api = async (url, opts = {}) => {
	const res = await fetch(url, {
		headers: { 'Content-Type': 'application/json' },
		...opts,
		body: opts.body ? JSON.stringify(opts.body) : undefined,
	})
	if (res.status === 401) throw new Error('UNAUTHED')
	const data = await res.json()
	if (!res.ok) throw new Error(data.error || 'Помилка')
	return data
}

export const loginApi = {
	check: () => api('/api/login'),
	login: (password) => api('/api/login', { method: 'POST', body: { password } }),
}

export const sheetApi = {
	list: () => api('/api/sheet'),
	get: (name) => api('/api/sheet?name=' + encodeURIComponent(name)),
}

export const searchApi = {
	query: (q) => api('/api/search?q=' + encodeURIComponent(q)),
}

export const itemApi = {
	patch: (body) => api('/api/item', { method: 'PATCH', body }),
	post: (body) => api('/api/item', { method: 'POST', body }),
	delete: (body) => api('/api/item', { method: 'DELETE', body }),
}

export const archiveApi = {
	archive: ({ sheet, row }) => api('/api/archive', { method: 'POST', body: { sheet, row } }),
	restore: ({ sheet, row }) => api('/api/archive', { method: 'POST', body: { sheet, row, action: 'restore' } }),
}

export const ledgerApi = {
	get: (sheet) => api('/api/ledger?sheet=' + encodeURIComponent(sheet)),
	post: (body) => api('/api/ledger', { method: 'POST', body }),
}

export const warehouseApi = {
	get: () => api('/api/warehouse'),
	post: (body) => api('/api/warehouse', { method: 'POST', body }),
	patch: (body) => api('/api/warehouse', { method: 'PATCH', body }),
	delete: (body) => api('/api/warehouse', { method: 'DELETE', body }),
}
