export const STATUS = {
	issued: {
		match: ['видан', 'выдан'],
		color: 'var(--green)',
		dim: 'var(--green-dim)',
		icon: '●',
		label: 'Видано',
	},
	warehouse: {
		match: ['ксп', 'склад'],
		color: 'var(--blue)',
		dim: 'var(--blue-dim)',
		icon: '●',
		label: 'На складі',
	},
	lost: {
		match: ['втрач', 'утер'],
		color: 'var(--red)',
		dim: 'var(--red-dim)',
		icon: '●',
		label: 'Втрачено',
	},
	writtenOff: {
		match: ['спис'],
		color: 'var(--gray)',
		dim: 'var(--gray-dim)',
		icon: '●',
		label: 'Списано',
	},
	default: {
		match: [],
		color: 'var(--amber)',
		dim: 'var(--amber-dim)',
		icon: '●',
		label: '',
	},
}

export const resolveStatus = (status) => {
	const v = (status || '').toLowerCase()
	for (const key of Object.keys(STATUS)) {
		if (key === 'default') continue
		const cfg = STATUS[key]
		if (cfg.match.some((m) => v.includes(m))) return { key, ...cfg }
	}
	return { key: 'default', ...STATUS.default }
}

export const statusColor = (status) => resolveStatus(status).color
