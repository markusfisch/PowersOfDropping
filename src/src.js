'use strict'

const PLAYER = 0,
	DUST = 1,
	FLOOR = 2,
	WALL = 3,
	ARROW = 4

let spriteSizes = [],
	gl,
	vertexPositionBuffer,
	vertexPositionLoc,
	texturePositionBuffer,
	texturePositionLoc,
	perspective,
	perspectiveLoc,
	transformation,
	transformationLoc,
	textureLoc,
	program,
	width,
	height,
	halfWidth,
	halfHeight,
	magnification = .1,
	yMax,
	tileSize,
	halfTileSize,
	showTouchControls = false,
	btnLeft,
	btnRight,
	btnUp,
	btnDown,
	btnBase,
	maxColsInView,
	maxRowsInView,
	map = [],
	mapCols,
	mapRows,
	items = [],
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
	shakePattern = [.1, .4, .7, .3, .5, .2],
	shakeLength = shakePattern.length,
	shakeDuration = 300,
	moveUntil = 0,
	moveDuration = 300,
	dust = [],
	dustLength = 20,
	dustDuration = 400,
	fallingBlocksLength = 16,
	fallingBlocks,
	pointersLength,
	pointersX = [],
	pointersY = [],
	keysDown = [],
	playerDestX,
	playerDestY,
	playerX,
	playerY,
	gameOver = 0

function drawSprite(sprite, x, y, xm, ym) {
	gl.bindBuffer(gl.ARRAY_BUFFER, texturePositionBuffer)
	gl.vertexAttribPointer(texturePositionLoc, 2, gl.FLOAT, gl.FALSE, 0,
		sprite << 5)

	const size = spriteSizes[sprite]
	transformation[0] = halfTileSize * size[0] * (xm || 1)
	transformation[4] = halfTileSize * size[1] * (ym || 1)

	transformation[6] = x
	transformation[7] = y

	gl.uniformMatrix3fv(transformationLoc, gl.FALSE, transformation)
	gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
}

function drawTouchControls() {
	drawSprite(ARROW, btnLeft, btnBase)
	drawSprite(ARROW, btnRight, btnBase)
	drawSprite(ARROW, btnUp, btnBase)
	drawSprite(ARROW, btnDown, btnBase)
}

function drawMap(shakeX, shakeY) {
	let vx = Math.min(Math.max(viewX, viewXMax), viewXMin),
		vy = Math.min(Math.max(viewY, viewYMin), viewYMax)
	vx += shakeX
	vy += shakeY
	const cl = Math.round(Math.max(0, -1 - vx) / tileSize),
		cr = Math.min(cl + maxColsInView, mapCols),
		rt = Math.round(Math.max(0, vy - yMax) / tileSize),
		rb = Math.min(rt + maxRowsInView, mapRows),
		skip = mapCols - (cr - cl),
		l = vx + cl * tileSize,
		t = vy - rt * tileSize
	let offset = rt * mapCols + cl
	for (let y = t, r = rt; r < rb; y -= tileSize, ++r, offset += skip) {
		// Draw row.
		for (let x = l, c = cl; c < cr; x += tileSize, ++c, ++offset) {
			const floor = map[offset]
			drawSprite(floor, x, y)
			const b = items[offset]
			if (b >= 0) {
				drawSprite(WALL, x, y + b, 1, 1 + b * 3)
			}
		}
		// Draw dust.
		for (let i = 0; i < dustLength; ++i) {
			const d = dust[i],
				dx = d.x,
				dy = d.y,
				life = d.life
			if (life > now && dy >= rt && dy < rb &&
					dx >= cl && dx < cr &&
					(dy - r) | 0 == 0) {
				drawSprite(DUST,
					vx + dx * tileSize,
					vy - dy * tileSize,
					1,
					1 + (life - now) / dustDuration)
			}
		}
		// Draw player.
		if (!gameOver && playerY >= rt && playerY < rb &&
				playerX >= cl && playerX < cr &&
				(playerY - r) | 0 == 0) {
			drawSprite(PLAYER,
				vx + playerX * tileSize,
				vy - playerY * tileSize,
				1,
				1 + Math.min(1, Math.max(
					Math.abs(playerDestX - playerX),
					Math.abs(playerDestY - playerY))))
		}
	}
}

function impact(x, y) {
	shake()
	spawnDust(x, y)
	if (Math.round(playerX) == x && Math.round(playerY) == y) {
		gameOver = now
	}
}

function updateBlocks() {
	for (let i = fallingBlocksLength; i--;) {
		const idx = fallingBlocks[i]
		if (idx > -1) {
			let b = items[idx]
			if (b > 0) {
				b -= .05 * factor
				if (b <= 0) {
					b = 0
					impact(idx % mapCols, idx / mapCols | 0)
					fallingBlocks[i] = -1
				}
				items[idx] = b
			}
		}
	}
}

function dropBlock(x, y) {
	for (let i = fallingBlocksLength; i--;) {
		if (fallingBlocks[i] < 0) {
			const offset = (y | 0) * mapCols + (x | 0),
				b = items[offset]
			if (b == -1) {
				items[offset] = 1
			}
			fallingBlocks[i] = offset
			break
		}
	}
}

function setViewDest(x, y) {
	viewDestX = -x * tileSize
	viewDestY = y * tileSize
}

function shake() {
	shakeUntil = now + shakeDuration
}

function spawnDust(x, y) {
	let specks = 2 + Math.random() * 4 | 0
	for (let i = 0; i < dustLength; ++i) {
		const d = dust[i]
		if (d.life < now) {
			d.x = x + (Math.random() - .5) * tileSize * 2
			d.y = y + (Math.random() - .5) * tileSize * 2
			d.life = now + Math.random() * dustDuration
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

	if (moveUntil > now) {
		const p = 1 - ((moveUntil - now) / moveDuration)
		playerX += (playerDestX - playerX) * p
		playerY += (playerDestY - playerY) * p
		viewX += (viewDestX - viewX) * p
		viewY += (viewDestY - viewY) * p
	}

	updateBlocks()

	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
	gl.bindBuffer(gl.ARRAY_BUFFER, vertexPositionBuffer)
	gl.vertexAttribPointer(vertexPositionLoc, 2, gl.FLOAT, gl.FALSE, 0, 0)

	drawMap(shakeX, shakeY)
	showTouchControls && drawTouchControls()
}

function canMoveTo(x, y) {
	const offset = y * mapCols + x
	return map[offset] === FLOOR && items[offset] !== 0
}

function move(dx, dy) {
	const x = Math.min(mapCols - 1, Math.max(0, playerDestX + dx)),
		y = Math.min(mapRows - 1, Math.max(0, playerDestY + dy))
	if (canMoveTo(x, y)) {
		playerDestX = x
		playerDestY = y
		if (Math.abs(viewDestX + x * tileSize) > viewMoveXAt) {
			viewDestX -= tileSize * dx
		}
		if (Math.abs(-viewDestY + y * tileSize) > viewMoveYAt) {
			viewDestY += tileSize * dy
		}
		moveUntil = now + moveDuration
		spawnDust(playerX, playerY)
	}
}

function inButton(btn, x, y) {
	return Math.abs(btn - x) < tileSize && Math.abs(btnBase - y) < tileSize
}

function processTouch() {
	if (gameOver) {
		return
	}
	for (let i = 0; i < pointersLength; ++i) {
		const px = pointersX[i],
			py = pointersY[i]
		if (inButton(btnLeft, px, py)) {
			move(-1, 0)
		} else if (inButton(btnRight, px, py)) {
			move(1, 0)
		}
		if (inButton(btnUp, px, py)) {
			move(0, -1)
		} else if (inButton(btnDown, px, py)) {
			move(0, 1)
		}
	}
}

function processKey() {
	if (gameOver) {
		return
	}
	if (keysDown[37] || keysDown[72]) {
		move(-1, 0)
	}
	if (keysDown[39] || keysDown[76]) {
		move(1, 0)
	}
	if (keysDown[38] || keysDown[75]) {
		move(0, -1)
	}
	if (keysDown[40] || keysDown[74]) {
		move(0, 1)
	}
	if (keysDown[32]) {
		dropBlock(Math.round(playerX), Math.round(playerY))
	}
	if (keysDown[83]) { // s
		magnification = magnification == .1
				? 1 / Math.max(mapCols, mapRows)
				: .1
		resize()
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
	event.preventDefault()
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

function setKey(event, down) {
	keysDown[event.keyCode] = down
	event.stopPropagation()
}

function keyUp(event) {
	setKey(event, false)
}

function keyDown(event) {
	setKey(event, true)
	processKey()
}

function wireInputs() {
	document.onkeydown = keyDown
	document.onkeyup = keyUp

	document.onmousedown = pointerDown
	document.onmousemove = pointerMove
	document.onmouseup = pointerUp
	document.onmouseout = pointerCancel

	if ('ontouchstart' in document) {
		document.ontouchstart = pointerDown
		document.ontouchmove = pointerMove
		document.ontouchend = pointerUp
		document.ontouchleave = pointerCancel
		document.ontouchcancel = pointerCancel
		showTouchControls = true
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

	setViewDest(playerX, playerY)
	viewX = viewDestX
	viewY = viewDestY

	const btnMargin = .15,
		btnSpacing = (2 - btnMargin * 2) / 3
	btnLeft = -1 + btnMargin
	btnDown = btnLeft + btnSpacing
	btnUp = btnDown + btnSpacing
	btnRight = btnUp + btnSpacing
	btnBase = -yMax + btnMargin

	perspective = new Float32Array([
		1, 0, 0,
		0, width / height, 0,
		0, 0, 1
	])
	gl.uniformMatrix3fv(perspectiveLoc, gl.FALSE, perspective)

	transformation = new Float32Array([
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
		x = w < 2 ? r : (l + 1 + Math.round(Math.random() * (w - 2))) | 1,
		y = h < 2 ? b : (t + 1 + Math.round(Math.random() * (h - 2))) | 1,
		skip = x < r && y < b ? Math.round(Math.random() * 4) % 4 : -1
	if (x < r) {
		const y1 = skip == 0 ?
				-1 :
				(t + Math.round(Math.random() * (y - t))) & 0xfffe,
			y2 = y < b ?
				skip == 1 ?
					-1 :
					(y + 1 + Math.round(Math.random() * (b - y - 1))) & 0xfffe :
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
				(l + Math.round(Math.random() * (x - l))) & 0xfffe,
			x2 = x < r ?
				skip == 3 ?
					-1 :
					(x + 1 + Math.round(Math.random() * (r - x - 1))) & 0xfffe :
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

function createMap() {
	fallingBlocks = []
	for (let i = fallingBlocksLength; i--;) {
		fallingBlocks[i] = -1
	}
	mapCols = mapRows = 31
	for (let i = mapCols * mapRows; i--;) {
		map[i] = FLOOR
		items[i] = -1
	}
	maze(2, 2, mapCols - 3, mapRows - 3)
	for (let y = mapRows / 3 | 0, ye = y + y; y < ye; ++y) {
		for (let x = mapCols / 3 | 0, xe = x + x; x < xe; ++x) {
			map[y * mapCols + x] = FLOOR
		}
	}
	playerX = playerDestX = mapCols >> 1
	playerY = playerDestY = mapRows >> 1
}

function initDust() {
	for (let i = dustLength; i-- > 0;) {
		dust[i] = {
			x: 0,
			y: 0,
			life: 0
		}
	}
}

function init(atlas) {
	initDust()
	createMap()

	const canvas = document.getElementById('C')
	gl = canvas.getContext('webgl')

	const texture = createTexture(atlas.canvas),
		program = createProgram(
			document.getElementById('VS').textContent,
			document.getElementById('FS').textContent)

	vertexPositionBuffer = createBuffer([
		-1, 1,
		-1, -1,
		1, 1,
		1, -1
	])
	texturePositionBuffer = createBuffer(atlas.coords)

	vertexPositionLoc = getEnabledAttribLocation(program, 'vertexPosition')
	texturePositionLoc = getEnabledAttribLocation(program, 'texturePosition')
	perspectiveLoc = gl.getUniformLocation(program, 'perspective')
	transformationLoc = gl.getUniformLocation(program, 'transformation')
	textureLoc = gl.getUniformLocation(program, 'texture')

	gl.enable(gl.BLEND)
	gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
	gl.clearColor(.066, .066, .066, 1)
	gl.useProgram(program)

	gl.activeTexture(gl.TEXTURE0)
	gl.bindTexture(gl.TEXTURE_2D, texture)
	gl.uniform1i(textureLoc, 0)

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

function svgToImg(svg, sw, sh, dw, dh) {
	const img = new Image()
	img.src = `data:image/svg+xml;base64,${btoa(
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${
		sw} ${sh}" width="${dw}" height="${dh}">${svg}</svg>`)}`
	return img
}

// Packing algorithm from:
// http://www.blackpawn.com/texts/lightmaps/default.html
function atlasInsert(node, w, h) {
	if (node.l) {
		// Try to insert image into left and then into right node.
		return atlasInsert(node.l, w, h) || atlasInsert(node.r, w, h)
	}
	if (node.img) {
		// Node already has an image.
		return
	}
	const rc = node.rc,
		rw = rc.r - rc.l,
		rh = rc.b - rc.t
	if (rw < w || rh < h) {
		// Node is too small.
		return
	}
	if (rw == w && rh == h) {
		// Node fits exactly.
		return node
	}
	// Put image into node and split the remaining space into two
	// new nodes.
	node.l = {}
	node.r = {}
	if (rw - w > rh - h) {
		// +-------+---+
		// | image |   |
		// +-------+   |
		// |       | l |
		// |   r   |   |
		// |       |   |
		// +-------+---+
		node.l.rc = {
			l: rc.l + w,
			t: rc.t,
			r: rc.r,
			b: rc.b
		}
		node.r.rc = {
			l: rc.l,
			t: rc.t + h,
			r: rc.l + w,
			b: rc.b,
		}
	} else {
		// +-------+---+
		// | image | l |
		// +-------+---+
		// |           |
		// |     r     |
		// |           |
		// +-----------+
		node.l.rc = {
			l: rc.l + w,
			t: rc.t,
			r: rc.r,
			b: rc.t + h,
		}
		node.r.rc = {
			l: rc.l,
			t: rc.t + h,
			r: rc.r,
			b: rc.b,
		}
	}
	// Fit rectangle to image.
	node.rc.r = rc.l + w - 1
	node.rc.b = rc.t + h - 1
	return node
}

function createAtlas(sources) {
	const atlasSize = 1024,
		svgSize = 100,
		spriteSize = 128,
		scale = spriteSize / svgSize,
		border = 1,
		uvPixel = 1 / atlasSize,
		pad = (border + 2) * uvPixel,
		nodes = {rc: {l: 0, t: 0, r: atlasSize, b: atlasSize}},
		coords = [],
		canvas = document.createElement('canvas'),
		ctx = canvas.getContext('2d'),
		len = sources.length
	canvas.width = canvas.height = atlasSize
	canvas.pending = len
	for (let i = 0; i < len; ++i) {
		const src = sources[i],
			fm = (src.split('<')[0].trim() + ';').split(';'),
			size = fm[0].split('x'),
			sw = size[0] || svgSize,
			sh = size[1] || svgSize,
			dw = sw * scale | 0,
			dh = sh * scale | 0,
			node = atlasInsert(nodes, dw + border * 2, dh + border * 2)
		if (!node) {
			return
		}
		const rc = node.rc,
			l = rc.l * uvPixel,
			t = rc.t * uvPixel,
			r = l + dw * uvPixel,
			b = t + dh * uvPixel
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
		spriteSizes.push([dw / spriteSize, dh / spriteSize])
		node.img = svgToImg(src, sw, sh, dw, dh).onload = function() {
			const angle = fm[1] * Math.PI / 180,
				x = node.rc.l + border,
				y = node.rc.t + border,
				w2 = dw >> 1,
				h2 = dh >> 1
			if (angle > 0) {
				ctx.save()
				ctx.translate(x + w2, y + h2)
				ctx.rotate(angle)
				ctx.drawImage(this, -w2, -h2)
				ctx.restore()
			} else {
				ctx.drawImage(this, x, y)
			}
			--canvas.pending
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
