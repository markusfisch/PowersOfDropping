'use strict'

const PLAYER = 0,
	DUST = 1,
	FLOOR = 2,
	WALL = 3,
	INCOMING = 4,
	UP = 5,
	RIGHT = 6,
	DROP = 7,
	ENEMY = 8,
	directions = [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}],
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
	map = [],
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
	width,
	height,
	halfWidth,
	halfHeight,
	magnification = .1,
	yMax,
	tileSize,
	halfTileSize,
	showTouchControls = false,
	btnLeftX,
	btnLeftY,
	btnRightX,
	btnRightY,
	btnUpX,
	btnUpY,
	btnDownX,
	btnDownY,
	btnDropX,
	btnDropY,
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
	blockIncoming = false,
	blockIncomingX,
	blockIncomingY,
	entitiesLength,
	pointersLength,
	player,
	gameOver = 0

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
	drawSprite(RIGHT, btnLeftX, btnLeftY, -1)
	drawSprite(RIGHT, btnRightX, btnRightY)
	drawSprite(UP, btnUpX, btnUpY)
	drawSprite(UP, btnDownX, btnDownY, 1, -1)
	drawSprite(DROP, btnDropX, btnDropY)
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
		t = vy - rt * tileSize
	let o = rt * mapCols + cl
	for (let y = t, r = rt; r < rb; y -= tileSize, ++r, o += skip) {
		for (let x = l, c = cl; c < cr; x += tileSize, ++c, ++o) {
			drawSprite(map[o], x, y)
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
	// Draw incoming marker.
	if (blockIncoming) {
		drawSprite(INCOMING,
			vx + blockIncomingX * tileSize,
			vy - blockIncomingY * tileSize)
	}
	// Draw entities.
	for (let i = 0; i < entitiesLength; ++i) {
		const e = entities[i]
		if (e.alive) {
			drawSprite(e.sprite,
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
		if (h > 0) {
			drawSprite(WALL,
				vx + b.x * tileSize,
				vy - b.y * tileSize + h,
				1,
				1 + h * 3)
		}
	}
}

function killPlayer() {
	gameOver = now
	player.alive = false
	shake()
}

function offset(x, y) {
	return y * mapCols + x
}

function set(x, y, tile) {
	map[offset(x, y)] = tile
}

function span(offset, step, times) {
	while (times-- > 0) {
		const peek = offset + step
		if (map[peek] != WALL) {
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
}

function impact(x, y) {
	shake()
	spawnDust(x, y)
	set(x, y, WALL)
	blockIncoming = false
	clearAdjacentWalls(x, y)
	for (let i = 0; i < entitiesLength; ++i) {
		const e = entities[i]
		if (Math.round(e.x) == x && Math.round(e.y) == y) {
			e.alive = false
			if (e === player) {
				killPlayer()
			}
		}
	}
}

function updateBlocks() {
	for (let i = 0; i < fallingBlocksLength; ++i) {
		const o = fallingBlocks[i]
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

function findMove(e) {
	if (player.alive) {
		const dx = player.x - e.x,
			dy = player.y - e.y,
			adx = Math.abs(Math.round(dx)),
			ady = Math.abs(Math.round(dy)),
			ad = adx + ady
		if (ad < 1) {
			// Bust!
			spawnDust(player.x, player.y, 4)
			killPlayer()
			return
		} else if (ad < 9) {
			// Chase!
			if (adx > ady) {
				e.vx = dx > 0 ? 1 : -1
				e.vy = 0
			} else {
				e.vx = 0
				e.vy = dy > 0 ? 1 : -1
			}
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
		return p
	}
	return 0
}

function updateEntities() {
	for (let i = 0; i < entitiesLength; ++i) {
		const e = entities[i]
		if (!e.alive) {
			continue
		}
		if (e === player) {
			const p = executeMove(e)
			viewX += (viewDestX - viewX) * p
			viewY += (viewDestY - viewY) * p
		} else if (e.moveUntil < now &&
				Math.round(e.destX) == Math.round(e.x) &&
				Math.round(e.destY) == Math.round(e.y)) {
			findMove(e)
		} else {
			executeMove(e)
		}
	}
}

function dropBlock(x, y) {
	for (let i = 0; i < fallingBlocksLength; ++i) {
		const o = fallingBlocks[i]
		if (o.height == 0) {
			o.x = Math.round(x)
			o.y = Math.round(y)
			o.height = 1
			return
		}
	}
}

function postDropBlock(x, y) {
	if (blockIncoming) {
		return
	}
	blockIncoming = true
	blockIncomingX = Math.round(x)
	blockIncomingY = Math.round(y)
	setTimeout(function() {
		dropBlock(blockIncomingX, blockIncomingY)
	}, 500)
}

function clearWallAt(x, y) {
	if (x < 0 || x >= mapCols || y < 0 || y >= mapRows) {
		return
	}
	const o = offset(x, y)
	if (map[o] == FLOOR) {
		return
	}
	map[o] = FLOOR
	spawnDust(x, y, 4)
	shake()
}

function clearWalls(x, y) {
	x = Math.round(x)
	y = Math.round(y)
	clearWallAt(x - 1, y)
	clearWallAt(x + 1, y)
	clearWallAt(x, y - 1)
	clearWallAt(x, y + 1)
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

	updateEntities()
	updateBlocks()

	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
	gl.bindBuffer(gl.ARRAY_BUFFER, vb)
	gl.vertexAttribPointer(vbl, 2, gl.FLOAT, gl.FALSE, 0, 0)

	draw(shakeX, shakeY)
	showTouchControls && drawTouchControls()
}

function canMoveTo(x, y) {
	return map[offset(x, y)] === FLOOR
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

function inButton(bx, by, x, y) {
	return Math.abs(bx - x) < btnSize && Math.abs(by - y) < btnSize
}

function processTouch() {
	if (gameOver) {
		return
	}
	for (let i = 0; i < pointersLength; ++i) {
		const px = pointersX[i],
			py = pointersY[i]
		let col = 0, row = 0
		if (inButton(btnLeftX, btnLeftY, px, py)) {
			col = -1
		} else if (inButton(btnRightX, btnRightY, px, py)) {
			col = 1
		} else if (inButton(btnUpX, btnUpY, px, py)) {
			row = -1
		} else if (inButton(btnDownX, btnDownY, px, py)) {
			row = 1
		}
		if (col || row) {
			move(col, row)
		}
		if (inButton(btnDropX, btnDropY, px, py)) {
			postDropBlock(player.x, player.y)
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
	if (gameOver) {
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
		postDropBlock(player.x, player.y)
		break
	case 13:
		clearWalls(player.x, player.y)
		break
	case 83: // s
		magnification = magnification == .1
				? 1 / Math.max(mapCols, mapRows)
				: .1
		resize()
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

	const btnMargin = .2,
		btnMag = width > height ? 2 : 3
	btnRightX = 1 - btnMargin
	btnRightY = -yMax + btnMargin * btnMag
	btnLeftX = btnRightX - btnMargin * btnMag
	btnLeftY = btnRightY
	btnDownX = btnRightX - btnMargin * btnMag * .5
	btnDownY = -yMax + btnMargin
	btnUpX = btnDownX
	btnUpY = btnLeftY + (btnLeftY - btnDownY)
	btnDropX = -1 + btnMargin * 1.5
	btnDropY = btnRightY
	btnSize = tileSize

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
				map[o] = WALL
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
				map[o + i] = WALL
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

function addEntity(sprite, x, y) {
	const e = {
		sprite: sprite,
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

function createMap() {
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
			height: 0
		}
	}
	mapCols = mapRows = 31
	for (let i = mapCols * mapRows; i--;) {
		map[i] = FLOOR
	}
	maze(2, 2, mapCols - 3, mapRows - 3)
	for (let y = (mapRows / 2 - 4) | 0, ye = mapRows - y; y < ye; ++y) {
		for (let x = (mapCols / 2 - 4) | 0, xe = mapCols - x; x < xe; ++x) {
			set(x, y, FLOOR)
		}
	}
	entities.length = 0
	player = addEntity(PLAYER, mapCols >> 1, mapRows >> 1)
	now = Date.now()
	for (let i = 0; i < 4; ++i) {
		let x, y
		do {
			x = Math.round(random() * (mapCols - 1))
			y = Math.round(random() * (mapRows - 1))
		} while (map[offset(x, y)] == WALL ||
				Math.abs(player.x - x) + Math.abs(player.y - y) < 8)
		addEntity(ENEMY, x, y)
	}
	entitiesLength = entities.length
}

function init(atlas) {
	createMap()

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

	window.onresize = resize
	resize()

	wireInputs()

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
	const sources = [],
		gs = document.getElementsByTagName('g')
	for (let i = 0, l = gs.length; i < l; ++i) {
		sources.push(gs[i].innerHTML)
	}
	waitForAtlas(createAtlas(sources))
}
