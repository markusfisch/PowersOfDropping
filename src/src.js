'use strict'

const PLAYER = 0,
	DUST = 1,
	FLOOR_ODD = 2,
	FLOOR_EVEN = 3,
	BLOCK = 4,
	INCOMING = 5,
	UP = 6,
	RIGHT = 7,
	DROP = 8,
	CATCHER_ODD = 9,
	CATCHER_EVEN = 10,
	EAGLE_EYE = 11,
	PORTAL = 12,
	directions = [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}],
	defaultMag = .1,
	shakePattern = [.1, .4, .7, .3, .5, .2],
	shakeLength = shakePattern.length,
	shakeDuration = 300,
	moveDuration = 300,
	dust = [],
	dustLength = 100,
	dustDuration = 400,
	fallingBlocksLength = 4,
	fallingBlocks = [],
	entities = [],
	ground = [],
	items = [],
	nodes = [],
	pointersX = [],
	pointersY = []

let seed = 1,
	gl,
	vb,
	vbl,
	tp,
	tpl,
	pm,
	pml,
	tm,
	tml,
	hud,
	scores,
	score = 1000,
	nextScoreUpdate = 0,
	width,
	height,
	halfWidth,
	halfHeight,
	magnification = defaultMag,
	yMax,
	tileSize,
	halfTileSize,
	showTouchControls = false,
	btnsLength,
	btns,
	btnSize,
	maxColsInView,
	maxRowsInView,
	mapCols,
	mapRows,
	viewDestX,
	viewDestY,
	viewX,
	viewY,
	viewXMin,
	viewXMax,
	viewYMin,
	viewYMax,
	viewMoveXAt,
	viewMoveYAt,
	now,
	factor,
	last,
	shakeUntil = 0,
	entitiesLength,
	pointersLength,
	player,
	level = 0,
	sight,
	introOver = false,
	gameOver

function drawSprite(sprite, x, y, xm, ym) {
	gl.bindBuffer(gl.ARRAY_BUFFER, tp)
	gl.vertexAttribPointer(tpl, 2, gl.FLOAT, gl.FALSE, 0,
		sprite << 5)

	tm[0] = halfTileSize * (xm || 1)
	tm[4] = halfTileSize * (ym || 1)

	tm[6] = x
	tm[7] = y

	gl.uniformMatrix3fv(tml, gl.FALSE, tm)
	gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
}

function drawTouchControls() {
	for (let i = 0; i < btnsLength; ++i) {
		const b = btns[i]
		drawSprite(b.sprite, b.x, b.y, b.w, b.h)
	}
}

function draw(shakeX, shakeY) {
	const vx = (maxColsInView >= mapCols
			? viewXMin + (viewXMax - viewXMin) * .5
			: Math.min(Math.max(viewX, viewXMax), viewXMin)) + shakeX,
		vy = (maxRowsInView >= mapRows
			? viewYMax + (viewYMin - viewYMax) * .5
			: Math.min(Math.max(viewY, viewYMin), viewYMax)) + shakeY,
		cl = Math.round(Math.max(0, -1 - vx) / tileSize),
		cr = Math.min(cl + maxColsInView, mapCols),
		rt = Math.round(Math.max(0, vy - yMax) / tileSize),
		rb = Math.min(rt + maxRowsInView, mapRows),
		skip = mapCols - (cr - cl),
		l = vx + cl * tileSize,
		t = vy - rt * tileSize,
		os = rt * mapCols + cl
	for (let o = os, y = t, r = rt; r < rb; y -= tileSize, ++r, o += skip) {
		for (let x = l, c = cl; c < cr; x += tileSize, ++c, ++o) {
			drawSprite(ground[o], x, y)
		}
	}
	// Draw incoming marker.
	for (let i = 0; i < fallingBlocksLength; ++i) {
		const b = fallingBlocks[i]
		if (b.height > 0) {
			drawSprite(INCOMING,
				vx + b.x * tileSize,
				vy - b.y * tileSize)
		}
	}
	// Draw items.
	for (let o = os, y = t, r = rt; r < rb; y -= tileSize, ++r, o += skip) {
		for (let x = l, c = cl; c < cr; x += tileSize, ++c, ++o) {
			const item = items[o]
			if (item) {
				drawSprite(item, x, y)
			}
		}
	}
	// Draw dust.
	for (let i = 0; i < dustLength; ++i) {
		const d = dust[i],
			life = d.life
		if (life > now) {
			const size = 1 + d.size * (life - now) / dustDuration
			drawSprite(DUST,
				vx + d.x * tileSize,
				vy - d.y * tileSize,
				size,
				size)
		}
	}
	// Draw entities.
	let frame = now / moveDuration | 0
	for (let i = 0; i < entitiesLength; ++i) {
		const e = entities[i]
		if (e.alive) {
			drawSprite(e.sprite(frame++),
				vx + e.x * tileSize,
				vy - e.y * tileSize,
				1,
				1 + Math.min(.2, Math.max(
					Math.abs(e.destX - e.x),
					Math.abs(e.destY - e.y))))
		}
	}
	// Draw falling blocks.
	for (let i = 0; i < fallingBlocksLength; ++i) {
		const b = fallingBlocks[i], h = b.height
		if (h > 0 && b.fallAt < now) {
			drawSprite(BLOCK,
				vx + b.x * tileSize,
				vy - b.y * tileSize + h,
				1,
				1 + h * 3)
		}
	}
}

function say(m) {
	hud.innerHTML = `<div class="B">${m}</div>`
	hud.style.animation = "pop .5s ease-in-out forwards"
	hud.style.display = "flex"
}

function gameWon() {
	if (gameOver) {
		return
	}
	score += 1000
	say(++level >= 15
			? "<h1>CONGRATS</h1>You beat the game!"
			: `<h1>LEVEL ${level} WON!</h1>Tap to proceed…`)
	gameOver = now
	for (let i = 0; i < entitiesLength; ++i) {
		const e = entities[i]
		if (e !== player) {
			e.alive = false
		}
	}
}

function gameLost() {
	if (gameOver) {
		return
	}
	say("<h1>LOST!</h1>Tap to try again…")
	gameOver = now
	player.alive = false
	shake()
}

function offset(x, y) {
	return y * mapCols + x
}

function setItem(x, y, tile) {
	items[offset(x, y)] = tile
}

function span(offset, step, times) {
	while (times-- > 0) {
		const peek = offset + step
		if (items[peek] != BLOCK) {
			break
		}
		offset = peek
	}
	return offset
}

function clearAdjacentWalls(x, y) {
	const o = offset(x, y),
		left = span(o, -1, x) % mapCols,
		right = span(o, 1, mapCols - x) % mapCols,
		top = span(o, -mapCols, y) / mapCols | 0,
		bottom = span(o, mapCols, mapRows - y) / mapCols | 0
	if (right - left > 1) {
		for (let i = left; i <= right; ++i) {
			clearWallAt(i, y)
		}
	}
	if (bottom - top > 1) {
		for (let i = top; i <= bottom; ++i) {
			clearWallAt(x, i)
		}
	}
	for (let i = mapCols * mapRows; i-- > 0; ) {
		if (items[i] == BLOCK) {
			return
		}
	}
	gameWon()
}

function impact(x, y) {
	shake()
	spawnDust(x, y)
	setItem(x, y, BLOCK)
	clearAdjacentWalls(x, y)
	for (let i = 0; i < entitiesLength; ++i) {
		const e = entities[i]
		if (Math.round(e.x) == x && Math.round(e.y) == y) {
			e.alive = false
			if (e === player) {
				gameLost()
			} else {
				score += 1000
			}
		}
	}
}

function updateBlocks() {
	for (let i = 0; i < fallingBlocksLength; ++i) {
		const o = fallingBlocks[i]
		if (o.fallAt > now) {
			continue
		}
		let h = o.height
		if (h > 0) {
			h -= .05 * factor
			if (h <= 0) {
				h = 0
				impact(o.x, o.y)
			}
			o.height = h
		}
	}
}

function toggleEagleEye() {
	magnification = magnification == defaultMag
			? 1 / Math.max(mapCols, mapRows)
			: defaultMag
	resize()
}

function findRandomSpot() {
	for (let t = 0; t < 1000; ++t) {
		const x = Math.round(random() * (mapCols - 1)),
			y = Math.round(random() * (mapRows - 1))
		if (items[offset(x, y)]) {
			continue
		}
		for (let i = 0; i < entitiesLength; ++i) {
			const e = entities[i]
			if (Math.abs(e.x - x) + Math.abs(e.y - y) < 8) {
				continue
			}
		}
		return [x, y]
	}
	return [0, 0]
}

function digestItem(e) {
	const o = offset(Math.round(e.x), Math.round(e.y))
	switch (items[o]) {
	case 0:
		return
	case PORTAL:
		const p = findRandomSpot()
		e.x = e.destX = p[0]
		e.y = e.destY = p[1]
		if (e === player) {
			setViewDest(e.x, e.y)
		}
		break
	case EAGLE_EYE:
		if (e === player) {
			toggleEagleEye()
		}
		break
	}
	items[o] = 0
}

function setDestination(e, x, y) {
	e.destX = x
	e.destY = y
	e.moveUntil = now + moveDuration
	spawnDust(e.x, e.y)
}

function soleClaim(me, x, y) {
	for (let i = 0; i < entitiesLength; ++i) {
		const e = entities[i]
		if (e !== me && e !== player &&
				Math.round(e.destX) == x &&
				Math.round(e.destY) == y) {
			return false
		}
	}
	return true
}

function dist(a, b) {
	return Math.abs(Math.round(a.x - b.x)) + Math.abs(Math.round(a.y - b.y))
}

function findPath(e, target) {
	for (let i = mapCols * mapRows; i-- > 0; ) {
		const n = nodes[i]
		n.p = null
		n.g = n.f = n.h = 0
	}
	const start = nodes[offset(Math.round(e.x), Math.round(e.y))],
		goal = nodes[offset(Math.round(target.x), Math.round(target.y))],
		openSet = [start],
		closedSet = []
	start.h = dist(e, target)
	while (openSet.length > 0) {
		let low = 0
		for (let i = 0; i < openSet.length; ++i) {
			if (openSet[i].f < openSet[low].f) {
				low = i
			}
		}

		const current = openSet[low]
		if (current === goal) {
			const path = []
			let n = current
			path.push(n)
			for (; n.p; n = n.p) {
				path.push(n.p)
			}
			const rev = path.reverse()
			if (rev.length > 1) {
				e.vx = rev[1].x - Math.round(e.x)
				e.vy = rev[1].y - Math.round(e.y)
			}
			return
		}

		openSet.splice(low, 1)
		closedSet.push(current)

		current.neighbors.forEach(neighbor => {
			if (!closedSet.includes(neighbor) &&
					items[offset(neighbor.x, neighbor.y)] != BLOCK) {
				const tg = current.g + 1
				let newPath = false
				if (openSet.includes(neighbor)) {
					if (tg < neighbor.g) {
						neighbor.g = tg
						newPath = true
					}
				} else {
					neighbor.g = tg
					newPath = true
					openSet.push(neighbor)
				}
				if (newPath) {
					neighbor.h = dist(neighbor, goal)
					neighbor.f = neighbor.g + neighbor.h
					neighbor.p = current
				}
			}
		})
	}
}

function findMove(e) {
	if (player.alive) {
		const d = dist(e, player)
		if (d < 1) {
			// Bust!
			spawnDust(player.x, player.y, 4)
			gameLost()
			return
		} else if (d < sight) {
			// Chase!
			findPath(e, player)
		}
	}
	for (let i = 0, s = Math.round(Math.random() * 4); ; ++i) {
		const tx = Math.round(e.x + e.vx),
			ty = Math.round(e.y + e.vy)
		if (tx > -1 && tx < mapCols &&
				ty > -1 && ty < mapRows &&
				canMoveTo(tx, ty) &&
				soleClaim(e, tx, ty)) {
			setDestination(e, tx, ty)
			break
		}
		if (i > 3) {
			break
		}
		const d = directions[(s + i) % 4]
		e.vx = d.x
		e.vy = d.y
	}
}

function executeMove(e) {
	if (e.moveUntil > now) {
		const p = 1 - ((e.moveUntil - now) / moveDuration)
		e.x += (e.destX - e.x) * p
		e.y += (e.destY - e.y) * p
		digestItem(e)
		return p
	}
	return 0
}

function updateEntities() {
	let alive = 0
	for (let i = 0; i < entitiesLength; ++i) {
		const e = entities[i]
		if (!e.alive) {
			continue
		}
		if (e === player) {
			const p = executeMove(e)
			viewX += (viewDestX - viewX) * p
			viewY += (viewDestY - viewY) * p
		} else {
			++alive
			if (e.moveUntil < now &&
					Math.round(e.destX) == Math.round(e.x) &&
					Math.round(e.destY) == Math.round(e.y)) {
				findMove(e)
			} else {
				executeMove(e)
			}
		}
	}
	if (!gameOver && alive < 1) {
		gameWon()
	}
}

function dropBlock(x, y) {
	x = Math.round(x)
	y = Math.round(y)
	for (let i = 0; i < fallingBlocksLength; ++i) {
		const o = fallingBlocks[i]
		if (o.height > 0 && o.x == x && o.y == y) {
			return
		}
	}
	for (let i = 0; i < fallingBlocksLength; ++i) {
		const o = fallingBlocks[i]
		if (o.height == 0) {
			o.x = x
			o.y = y
			o.height = 1
			o.fallAt = now + 1500
			return
		}
	}
}

function pickItem() {
	const r = Math.random()
	if (r < .05) {
		return EAGLE_EYE
	} else if (r < .1) {
		return PORTAL
	}
	return 0
}

function clearWallAt(x, y) {
	if (x < 0 || x >= mapCols || y < 0 || y >= mapRows) {
		return
	}
	const o = offset(x, y)
	if (items[o] != BLOCK) {
		return
	}
	score += 1
	items[o] = pickItem()
	spawnDust(x, y, 4)
	shake()
}

function setViewDest(x, y) {
	viewDestX = -x * tileSize
	viewDestY = y * tileSize
}

function shake() {
	shakeUntil = now + shakeDuration
}

function spawnDust(x, y, size) {
	let specks = 2 + Math.random() * 4 | 0
	for (let i = 0; i < dustLength; ++i) {
		const d = dust[i]
		if (d.life < now) {
			d.x = x + (Math.random() - .5) * tileSize * 3
			d.y = y + (Math.random() - .5) * tileSize * 3
			d.life = now + Math.random() * dustDuration
			d.size = size || 1
			if (--specks < 0) {
				break
			}
		}
	}
}

function run() {
	requestAnimationFrame(run)

	now = Date.now()
	factor = (now - last) / 16
	last = now

	let shakeX = 0, shakeY = 0
	if (shakeUntil > now) {
		let p = (shakeUntil - now) / shakeDuration * .05
		shakeX = shakePattern[(now + 1) % shakeLength] * p
		shakeY = shakePattern[now % shakeLength] * p
	}

	if (introOver) {
		if (gameOver == 0 && nextScoreUpdate < now) {
			nextScoreUpdate = now + 1000
			score -= 1
			scores.innerHTML = `L:${level + 1} S:${score}`
			if (score <= 0 && !gameOver) {
				gameLost()
			}
		}
		updateEntities()
		updateBlocks()
	}

	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
	gl.bindBuffer(gl.ARRAY_BUFFER, vb)
	gl.vertexAttribPointer(vbl, 2, gl.FLOAT, gl.FALSE, 0, 0)

	draw(shakeX, shakeY)
	showTouchControls && drawTouchControls()
}

function canMoveTo(x, y) {
	return items[offset(x, y)] != BLOCK
}

function move(dx, dy) {
	const x = Math.min(mapCols - 1, Math.max(0, player.destX + dx)),
		y = Math.min(mapRows - 1, Math.max(0, player.destY + dy))
	if (canMoveTo(x, y)) {
		setDestination(player, x, y)
		if (Math.abs(viewDestX + x * tileSize) > viewMoveXAt) {
			viewDestX -= tileSize * dx
		}
		if (Math.abs(-viewDestY + y * tileSize) > viewMoveYAt) {
			viewDestY += tileSize * dy
		}
	}
}

function hideHud() {
	hud.style.display = "none"
}

function tryRestart() {
	if (level < 15 && now - gameOver > 1000) {
		magnification = defaultMag
		createLevel()
		resize()
		hideHud()
	}
}

function hideIntro() {
	introOver = true
	hideHud()
}

function processTouch() {
	if (!introOver) {
		hideIntro()
		return
	}
	if (gameOver) {
		tryRestart()
		return
	}
	for (let i = 0; i < pointersLength; ++i) {
		const px = pointersX[i],
			py = pointersY[i]
		let d
		for (let i = 0; i < btnsLength; ++i) {
			const b = btns[i]
			if (Math.abs(b.x - px) < btnSize &&
					Math.abs(b.y - py) < btnSize) {
				d = b.click()
				break
			}
		}
		if (d) {
			move(d[0], d[1])
		}
	}
}

function pageXToGl(x) {
	return (x - halfWidth) / halfWidth
}

function pageYToGl(y) {
	return (halfHeight - y) / (halfHeight / yMax)
}

function setPointer(event, down) {
	if (!down) {
		pointersLength = event.touches ? event.touches.length : 0
	} else if (event.touches) {
		const touches = event.touches
		pointersLength = touches.length

		for (let i = pointersLength; i--;) {
			const t = touches[i]
			pointersX[i] = pageXToGl(t.pageX)
			pointersY[i] = pageYToGl(t.pageY)
		}
	} else {
		pointersLength = 1
		pointersX[0] = pageXToGl(event.pageX)
		pointersY[0] = pageYToGl(event.pageY)
	}
	event.stopPropagation()
}

function pointerCancel(event) {
	setPointer(event, false)
}

function pointerUp(event) {
	if (showTouchControls) {
		processTouch()
	}
	setPointer(event, false)
}

function pointerMove(event) {
	setPointer(event, pointersLength)
}

function pointerDown(event) {
	setPointer(event, true)
}

function processKey(keyCode) {
	if (!introOver) {
		hideIntro()
		return
	}
	if (gameOver) {
		tryRestart()
		return
	}
	switch (keyCode) {
	case 37:
	case 72:
		move(-1, 0)
		break
	case 39:
	case 76:
		move(1, 0)
		break
	case 38:
	case 75:
		move(0, -1)
		break
	case 40:
	case 74:
		move(0, 1)
		break
	case 32:
		dropBlock(player.x, player.y)
		break
	}
}

function keyUp(event) {
	event.stopPropagation()
}

function keyDown(event) {
	processKey(event.keyCode)
	event.stopPropagation()
}

function wireInputs() {
	document.onkeydown = keyDown
	document.onkeyup = keyUp

	showTouchControls = 'ontouchstart' in document
	if (showTouchControls) {
		document.ontouchstart = pointerDown
		document.ontouchmove = pointerMove
		document.ontouchend = pointerUp
		document.ontouchleave = pointerCancel
		document.ontouchcancel = pointerCancel
	} else {
		document.onmousedown = pointerDown
		document.onmousemove = pointerMove
		document.onmouseup = pointerUp
		document.onmouseout = pointerCancel
	}

	// Prevent pinch/zoom on iOS 11 and above.
	document.addEventListener('gesturestart', function(event) {
		event.preventDefault()
	}, 0)
	document.addEventListener('gesturechange', function(event) {
		event.preventDefault()
	}, 0)
	document.addEventListener('gestureend', function(event) {
		event.preventDefault()
	}, 0)
}

function layoutTouchControls() {
	const margin = .2,
		mag = width > height ? 2 : 3,
		rightX = 1 - margin,
		rightY = -yMax + margin * mag,
		leftX = rightX - margin * mag,
		leftY = rightY,
		downX = rightX - margin * mag * .5,
		downY = -yMax + margin,
		upX = downX,
		upY = leftY + (leftY - downY),
		dropX = -1 + margin * 1.5,
		dropY = rightY,
		size = defaultMag / magnification
	btns = [
		{
			sprite: RIGHT, w: size, h: size,
			x: rightX,
			y: rightY,
			click: () => [1, 0]
		},
		{
			sprite: RIGHT, w: -size, h: size,
			x: leftX,
			y: leftY,
			click: () => [-1, 0]
		},
		{
			sprite: UP, w: size, h: -size,
			x: downX,
			y: downY,
			click: () => [0, 1]
		},
		{
			sprite: UP, w: size, h: size,
			x: upX,
			y: upY,
			click: () => [0, -1]
		},
		{
			sprite: DROP, w: size, h: size,
			x: dropX,
			y: dropY,
			click: () => dropBlock(player.x, player.y)
		}
	]
	btnsLength = btns.length
	btnSize = tileSize * size
}

function resize() {
	width = gl.canvas.clientWidth
	height = gl.canvas.clientHeight

	halfWidth = width >> 1
	halfHeight = height >> 1
	yMax = height / width

	gl.canvas.width = width
	gl.canvas.height = height
	gl.viewport(0, 0, width, height)

	tileSize = Math.min(1, yMax) * magnification * 2
	maxColsInView = (2 / tileSize | 0) + 2
	maxRowsInView = ((yMax + yMax) / tileSize | 0) + 2

	halfTileSize = tileSize * .5
	viewXMin = -1 + halfTileSize
	viewXMax = 1 - (mapCols * tileSize) + halfTileSize
	viewYMin = yMax - halfTileSize
	viewYMax = (mapRows * tileSize) - yMax - halfTileSize
	viewMoveXAt = .7
	viewMoveYAt = yMax * viewMoveXAt

	setViewDest(player.x, player.y)
	viewX = viewDestX
	viewY = viewDestY

	if (showTouchControls) {
		layoutTouchControls()
	}

	pm = new Float32Array([
		1, 0, 0,
		0, width / height, 0,
		0, 0, 1
	])
	gl.uniformMatrix3fv(pml, gl.FALSE, pm)

	tm = new Float32Array([
		1, 0, 0,
		0, 1, 0,
		0, 0, 1
	])
}

function getEnabledAttribLocation(program, name) {
	const loc = gl.getAttribLocation(program, name)
	gl.enableVertexAttribArray(loc)
	return loc
}

function createBuffer(data, usage) {
	const id = gl.createBuffer()
	gl.bindBuffer(gl.ARRAY_BUFFER, id)
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data),
		usage || gl.STATIC_DRAW)
	return id
}

function compileShader(type, src) {
	const id = gl.createShader(type)
	gl.shaderSource(id, src)
	gl.compileShader(id)
	return id
}

function createProgram(vs, fs) {
	const id = gl.createProgram()
	gl.attachShader(id, compileShader(gl.VERTEX_SHADER, vs))
	gl.attachShader(id, compileShader(gl.FRAGMENT_SHADER, fs))
	gl.linkProgram(id)
	if (!gl.getProgramParameter(id, gl.LINK_STATUS)) {
		throw gl.getProgramInfoLog(id)
	}
	return id
}

function createTexture(image) {
	const id = gl.createTexture()
	gl.bindTexture(gl.TEXTURE_2D, id)
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
	gl.generateMipmap(gl.TEXTURE_2D)
	return id
}

function maze(l, t, r, b) {
	if (l == r || t == b) {
		return
	}
	const w = r - l,
		h = b - t,
		x = w < 2 ? r : (l + 1 + Math.round(random() * (w - 2))) | 1,
		y = h < 2 ? b : (t + 1 + Math.round(random() * (h - 2))) | 1,
		skip = x < r && y < b ? Math.round(random() * 4) % 4 : -1
	if (x < r) {
		const y1 = skip == 0 ?
				-1 :
				(t + Math.round(random() * (y - t))) & 0xfffe,
			y2 = y < b ?
				skip == 1 ?
					-1 :
					(y + 1 + Math.round(random() * (b - y - 1))) & 0xfffe :
				-1
		for (let i = t, o = t * mapCols + x; i <= b; ++i, o += mapCols) {
			if (i != y1 && i != y2) {
				items[o] = BLOCK
			}
		}
	}
	if (y < b) {
		const x1 = skip == 2 ?
				-1 :
				(l + Math.round(random() * (x - l))) & 0xfffe,
			x2 = x < r ?
				skip == 3 ?
					-1 :
					(x + 1 + Math.round(random() * (r - x - 1))) & 0xfffe :
				-1
		for (let i = l, o = y * mapCols; i <= r; ++i) {
			if (i != x1 && i != x2) {
				items[o + i] = BLOCK
			}
		}
	}
	maze(l, t, x - 1, y - 1)
	maze(x + 1, t, r, y - 1)
	maze(l, y + 1, x - 1, b)
	maze(x + 1, y + 1, r, b)
}

function random() {
	// From: http://indiegamr.com/generate-repeatable-random-numbers-in-js/
	return (seed = (seed * 9301 + 49297) % 233280) / 233280
}

function addEntity(sprites, x, y) {
	const sl = sprites.length, e = {
		sprite: (f) => sprites[f % sl],
		alive: true,
		moveUntil: 0,
		x: x,
		y: y,
		destX: x,
		destY: y,
		vx: random() > .5 ? -1 : 1,
		vy: 0
	}
	entities.push(e)
	return e
}

function indexNeighbors() {
	for (let i = 0, y = 0; y < mapRows; ++y) {
		for (let x = 0; x < mapCols; ++x, ++i) {
			const neighbors = []
			if (x > 0) {
				neighbors.push(nodes[offset(x - 1, y)])
			}
			if (x < mapCols - 1) {
				neighbors.push(nodes[offset(x + 1, y)])
			}
			if (y > 0) {
				neighbors.push(nodes[offset(x, y - 1)])
			}
			if (y < mapRows - 1) {
				neighbors.push(nodes[offset(x, y + 1)])
			}
			nodes[i].neighbors = neighbors
		}
	}
}

function createLevel() {
	gameOver = 0
	seed = level + 1
	for (let i = dustLength; i-- > 0;) {
		dust[i] = {
			x: 0,
			y: 0,
			life: 0
		}
	}
	for (let i = fallingBlocksLength; i-- > 0;) {
		fallingBlocks[i] = {
			x: 0,
			y: 0,
			height: 0,
			fallAt: 0
		}
	}
	mapCols = mapRows = 15 + level * 2
	sight = (Math.max(mapCols, mapRows) / 3 | 0) + level
	for (let i = 0, y = 0; y < mapRows; ++y) {
		for (let x = 0; x < mapCols; ++x, ++i) {
			ground[i] = i & 1 ? FLOOR_ODD : FLOOR_EVEN
			items[i] = 0
			nodes[i] = {
				x: x,
				y: y
			}
		}
	}
	indexNeighbors()
	maze(2, 2, mapCols - 3, mapRows - 3)
	for (let y = (mapRows / 2 - 3) | 0, ye = mapRows - y; y < ye; ++y) {
		for (let x = (mapCols / 2 - 3) | 0, xe = mapCols - x; x < xe; ++x) {
			setItem(x, y, 0)
		}
	}
	entities.length = entitiesLength = 0
	player = addEntity([PLAYER], mapCols >> 1, mapRows >> 1)
	for (let i = 0, max = 1 + level / 3 | 0; i < max; ++i) {
		const spot = findRandomSpot()
		addEntity([CATCHER_ODD, CATCHER_EVEN], spot[0], spot[1])
	}
	entitiesLength = entities.length
}

function init(atlas) {
	createLevel()

	const canvas = document.getElementById('C')

	gl = canvas.getContext('webgl')
	gl.enable(gl.BLEND)
	gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
	gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1)

	vb = createBuffer([
		-1, 1,
		-1, -1,
		1, 1,
		1, -1
	])
	tp = createBuffer(atlas.coords)

	const program = createProgram(
			document.getElementById('VS').textContent,
			document.getElementById('FS').textContent)

	vbl = getEnabledAttribLocation(program, 'vp')
	tpl = getEnabledAttribLocation(program, 'tp')
	pml = gl.getUniformLocation(program, 'p')
	tml = gl.getUniformLocation(program, 't')

	gl.activeTexture(gl.TEXTURE0)
	gl.bindTexture(gl.TEXTURE_2D, createTexture(atlas.canvas))

	gl.clearColor(.066, .066, .066, 1)
	gl.useProgram(program)

	wireInputs()

	window.onresize = resize
	resize()

	last = Date.now() - 16
	run()
}

function waitForAtlas(atlas) {
	if (atlas.canvas.pending > 0) {
		setTimeout(function() {
			waitForAtlas(atlas)
		}, 100)
	} else {
		init(atlas)
	}
}

function svgToImg(svg, src, dst) {
	const img = new Image()
	img.src = `data:image/svg+xml;base64,${btoa(
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${
		src} ${src}" width="${dst}" height="${dst}">${svg}</svg>`)}`
	return img
}

function createAtlas(sources) {
	const atlasSize = 1024,
		svgSize = 100,
		spriteSize = 128,
		uvPixel = 1 / atlasSize,
		pad = uvPixel * 2,
		coords = [],
		canvas = document.createElement('canvas'),
		ctx = canvas.getContext('2d'),
		len = sources.length
	canvas.width = canvas.height = atlasSize
	canvas.pending = len
	for (let i = 0, x = 0, y = 0; i < len; ++i) {
		const src = sources[i],
			l = x * uvPixel,
			t = y * uvPixel,
			r = l + spriteSize * uvPixel,
			b = t + spriteSize * uvPixel
		// A--C
		// | /|
		// |/ |
		// B--D
		coords.push(
			l + pad, t + pad,
			l + pad, b - pad,
			r - pad, t + pad,
			r - pad, b - pad,
		)
		const xx = x, yy = y
		svgToImg(src, svgSize, spriteSize).onload = function() {
			ctx.drawImage(this, xx, yy)
			--canvas.pending
		}
		x += spriteSize
		if (x >= atlasSize) {
			x = 0
			y += spriteSize
		}
	}
	return {
		canvas: canvas,
		coords: coords
	}
}

window.onload = function() {
	hud = document.getElementById('H')
	scores = document.getElementById('S')
	const sources = [],
		gs = document.getElementsByTagName('g')
	for (let i = 0, l = gs.length; i < l; ++i) {
		sources.push(gs[i].innerHTML)
	}
	waitForAtlas(createAtlas(sources))
}
