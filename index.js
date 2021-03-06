const blessed = require('blessed')
const Eris = require('eris')
const config = require('./config')
const c = new Eris(config.token, {
	guildCreateTimeout: 10000
})

function escapeSubs (strings, ...subs) {
	subs = subs.map(s => blessed.escape('' + s))
	let result = strings[0]
	for (let i in subs) {
		result += subs[i]
		result += strings[parseInt(i, 10) + 1] || ''
	}
	return result
}

function forceLength (string, length, align = 'left') {
	if (align === 'left') {
		string = string.padEnd(length)
	} else if (align === 'right') {
		string = string.padStart(length)
	} else if (align === 'center' && string.length < length) {
		const leftOverLength = length - string.length
		string = string.padStart(Math.floor(leftOverLength / 2 + string.length)).padEnd(length)
	} else {
		throw new TypeError("alignment must be one of 'left', 'center', 'right' (default is 'left')")
	}
	if (string.length > length) {
		string = string.slice(0, length - 1) + '…'
	}
	return string
}

// Set up interface //

const STYLES = {
	guildsChannels: {
	},
	guildsChannelsList: {
		selected: {
			fg: 'black',
			bg: 'white'
		}
	},
	messagesFrame: {
	},
	messagesBox: {
	},
	messagesBoxScrollbar: {
		bg: 'gray'
	},
	messagesBoxScrollbarTrack: {
		bg: 'white'
	}
}

const SIZES = {
	guildsWidth: 26,
	guildsWidthInside: 25
}

class DiscordInterface {
	constructor () {
		this.messageCache = {}

		this.screen = blessed.screen({
			smartCSR: true,
			fullUnicode: false,
			title: 'Discord CLI'
		})

		this.guildsFrame = blessed.box({
			parent: this.screen,
			top: 0,
			left: 0,
			width: SIZES.guildsWidth,
			height: '50%',
			tags: true,
			style: STYLES.guildsChannels
		})
		this.channelsFrame = blessed.box({
			parent: this.screen,
			top: '50%',
			left: 0,
			width: SIZES.guildsWidth,
			height: '50%',
			tags: true,
			style: STYLES.guildsChannels
		})

		this.guildsList = blessed.list({
			parent: this.guildsFrame,
			top: 1,
			left: 0,
			width: '100%-1',
			height: '100%-1',
			tags: true,
			style: STYLES.guildsChannelsList,
			invertSelected: false
		})
		this.guildsList.key(['up', 'k'], () => {
			this.guildsList.up()
			this.updateSelectedGuildFromList()
		})
		this.guildsList.key(['down', 'j'], () => {
			this.guildsList.down()
			this.updateSelectedGuildFromList()
		})
		this.guildsList.key('z', () => {
			this.guildsList.select(this.guilds.indexOf(this.selectedGuildIndex))
			this.screen.render()
		})
		// this.guildsList.key(['enter', 'space'], () => {
		// 	this.updateSelectedGuildFromList()
		// })
		this.guildsList.focus()

		this.channelsList = blessed.list({
			parent: this.channelsFrame,
			top: 1,
			left: 0,
			width: '100%-1',
			height: '100%-1',
			tags: true,
			style: STYLES.guildsChannelsList,
			invertSelected: false
		})
		this.channelsList.key(['up', 'k'], () => {
			let originalIndex = this.channelsList.selected
			this.channelsList.up()
			let newIndex = this.channelsList.selected
			while (this.channels[newIndex].type === 4) {
				if (newIndex === 0) {
					this.channelsList.select(originalIndex)
					break
				}
				this.channelsList.up()
				newIndex = this.channelsList.selected
			}
			this.screen.render()
		})
		this.channelsList.key(['down', 'j'], () => {
			let originalIndex = this.channelsList.selected
			this.channelsList.down()
			let newIndex = this.channelsList.selected
			while (this.channels[newIndex].type === 4) {
				if (newIndex === this.channels.length - 1) {
					this.channelsList.select(originalIndex)
					break
				}
				this.channelsList.down()
				newIndex = this.channelsList.selected
			}
			this.screen.render()
		})
		this.channelsList.key(['space', 'enter'], () => {
			this.updateSelectedChannelFromList()
		})

		this.messagesFrame = blessed.box({
			parent: this.screen,
			top: 0,
			left: SIZES.guildsWidth,
			width: `100%-${SIZES.guildsWidth}`,
			height: '100%',
			tags: true,
			style: STYLES.messagesFrame
		})
		this.messagesBox = blessed.box({
			parent: this.messagesFrame,
			top: 1,
			left: 0,
			width: '100%',
			height: '100%',
			scrollable: true,
			alwaysScroll: true,
			tags: true,
			style: STYLES.messagesBox,
			invertSelected: false,
			scrollbar: {
				style: STYLES.messagesBoxScrollbar,
				track: STYLES.messagesBoxScrollbarTrack
			}
		})
		this.messagesBox.key(['up', 'h'], (ch, key) => {
			this.messagesBox.scroll(-1)
			this.screen.render()
		})
		this.messagesBox.key(['down', 'j'], (ch, key) => {
			this.messagesBox.scroll(1)
			this.screen.render()
		})
		this.messagesBox.key('escape', (ch, key) => {
			this.messagesBox.setScrollPerc(100)
			this.screen.render()
		})
		// this.currentUserName = blessed.box({
		// 	parent: this.messagesFrame,
		// 	bottom: 0,
		// 	left: 0,
		// 	width: config.nameLength + 1,
		// 	height: 1,
		// 	tags: true,
		// 	style: {
		// 		bg: 'gray'
		// 	}
		// })
		// this.messageComposeLine = blessed.box({
		// 	parent: this.messagesFrame,
		// 	bottom: 0,
		// 	left: config.nameLength + 1,
		// 	width: '100%',
		// 	height: 1,
		// 	style: {
		// 		bg: 'gray'
		// 	}
		// })

		this.screen.key('g', (ch, key) => {
			this.guildsList.focus()
			this.focusedPanel = 'guilds'
			this.screen.render()
		})
		this.screen.key('c', (ch, key) => {
			this.channelsList.focus()
			this.focusedPanel = 'channels'
			this.screen.render()
		})
		this.screen.key('m', (ch, key) => {
			this.messagesBox.focus()
			this.focusedPanel = 'messages'
			this.screen.render()
		})
		this.screen.key(['C-q'], function(ch, key) {
			return process.exit(0)
		})
		this.focusedPanel = 'guilds'
		this.guildsFrame.setContent(this.textForGuildsFrame())
		this.channelsFrame.setContent(this.textForChannelsFrame())
		this.messagesFrame.setContent(this.textForMessagesFrame())

		this.channels = []
		this.screen.render()
	}

	set focusedPanel (panel) {
		this._focusedPanel = panel
		this.guildsFrame.setContent(this.textForGuildsFrame())
		this.channelsFrame.setContent(this.textForChannelsFrame())
		this.messagesFrame.setContent(this.textForMessagesFrame())
	}
	get focusedPanel () {
		return this._focusedPanel
	}

	set guilds (guilds) {
		this._guilds = guilds
		this.guildsFrame.setContent(this.textForGuildsFrame())
		this.guildsList.setItems(guilds.map(this.guildLine))
		this.screen.render()
	}
	get guilds () {
		return this._guilds
	}

	set selectedGuild (guild) {
		this._selectedGuild = guild
		if (guild) {
			this.channels = guild.channels
		} else {
			this.channels = []
		}
	}
	get selectedGuild () {
		return this._selectedGuild
	}

	set channels (channels) {
		this._channels = this.sortedChannelList(channels)
		this.channelsFrame.setContent(this.textForChannelsFrame())
		this.channelsList.setItems(this.channels.map(this.channelLine))
		this.channelsList.select(0)
		this.screen.render()
	}
	get channels () {
		return this._channels
	}

	set selectedChannel (channel) {
		this._selectedChanel = channel
		this.messagesFrame.setContent(this.textForMessagesFrame())
		this.screen.render()
		this.getMessages()
	}
	get selectedChannel () {
		return this._selectedChanel
	}

	textForGuildsFrame (focused = this.focusedPanel === 'guilds') {
		const firstLine = this.header(`${focused ? '{green-fg}{underline}' : ''}[G]uilds (${(this.guilds || []).length})${focused ? '{/}' : ''}`, SIZES.guildsWidth, '═', '╤')
		const secondLine = ''.padEnd(SIZES.guildsWidthInside) + '│'
		const lines = Array(this.guildsFrame.height).fill(secondLine)
		lines.unshift(firstLine)
		return lines.join('\n')
	}

	textForChannelsFrame (focused = this.focusedPanel === 'channels') {
		const firstLine = this.header(`${focused ? '{green-fg}{underline}' : ''}[C]hannels (${(this.channels || []).length})${focused ? '{/}' : ''}`, SIZES.guildsWidth, '═', '╡')
		const secondLine = ''.padEnd(SIZES.guildsWidthInside) + '│'
		const lines = Array(this.guildsFrame.height).fill(secondLine)
		lines.unshift(firstLine)
		return lines.join('\n')
	}

	textForMessagesFrame (focused = this.focusedPanel === 'messages') {
		let guildName
		if (this.selectedGuild) {
			guildName = blessed.escape(this.selectedGuild.name)
		} else {
			guildName = 'No guild'
		}
		let channelName
		if (this.selectedChannel) {
			console.error(this.selectedChannel.name)
			channelName = blessed.escape(this.selectedChannel.name)
		} else {
			channelName = 'No channel'
		}
		return this.header(`${focused ? '{green-fg}{underline}' : ''}[M] ${guildName} > ${channelName}{/}`, this.messagesFrame.width, '═', '═')
	}

	guildLine (guild, index) {
		console.error(guild ? guild.name : 'oh shit ' + guild)
		let line = '{bold}'

		// Number
		if (index < 9) {
			line += (index + 1)
		} else if (index == 9) {
			line += '0'
		} else {
			line += ' '
		}
		line += '{/} '

		// Cut name to the space remaining
		// magic number 3: number, unread indicator, space on the left
		const maxNameLength = SIZES.guildsWidthInside - 2
		let guildName = blessed.escape(forceLength(guild.name, maxNameLength))
		line += guildName
		return line
	}

	updateSelectedGuildFromList () {
		const index = this.guildsList.selected
		this.selectedGuild = this.guilds[index]
		this.channelsList.select(0)
		this.screen.render()
	}

	updateSelectedChannelFromList () {
		const index = this.channelsList.selected
		this.selectedChannel = this.channels[index]
		this.messagesFrame.setContent(this.textForMessagesFrame())
		this.screen.render()
	}

	channelLine (channel, index, list) {
		// Indexing excludes channel categories
		let prefix = '{bold}'
		let suffix = ''
		if (channel.type === 0) {
			// Text channel
			const numCategoriesAbove = list.slice(0, index).filter(c => c.type === 4).length
			index -= numCategoriesAbove
			if (index < 9) {
				prefix += (index + 1)
			} else if (index == 9) {
				prefix += '0'
			} else {
				prefix += ' '
			}
			prefix += '{/} #'
		} else {
			prefix = '── '
		}
		// Cut name to the space remaining
		const maxNameLength = SIZES.guildsWidthInside - prefix.length + 12
		let channelName
		if (channel.name.length > maxNameLength) {
			channelName = channel.name.substr(0, maxNameLength - 1) + '…'
		} else if (channel.type === 4 && channel.name.length + 2 < maxNameLength) {
			channelName = (channel.name + ' ').padEnd(maxNameLength, '─')
		} else {
			channelName = channel.name.padEnd(maxNameLength)
		}
		channelName = blessed.escape(channelName)

		// if (channel.type === 4) {
		// 	prefix = `{gray-fg}${prefix}`
		// 	channelName += '{/gray-fg}'
		// }

		return `${prefix}${channelName}`
	}

	header (title, width, left = '╒', right = '╕', segment = '═') {
		const titleLessFormatting = blessed.stripTags(title)
		const extraCharacters = title.length - titleLessFormatting.length
		if (width < 5) return `${left}${''.padEnd(width - 2, segment)}${right}`
		const paddedTitle = ` ${title} `.padEnd(width - 2 + extraCharacters, segment).replace(title, '{bold}$&{/}')
		return `${left}${paddedTitle}${right}`
	}

	sortedChannelList (channels) {
		let list = []

		// For every channel category, add it and its children to the list
		let categories = channels.filter(c => c.type === 4).sort((a, b) => a.position - b.position)
		for (let categoryChannel of categories) {
			list.push(categoryChannel)
			const parentId = categoryChannel.id
			const children = channels.filter(c => c.type === 0 && c.parentID === parentId).sort((a, b) => a.position - b.position)
			for (let childChannel of children) {
				list.push(childChannel)
			}
		}

		// Then, push all the channels with no parent to the top
		const orphans = channels.filter(c => c.type === 0 && !c.parentID).sort((a, b) => a.position - b.position)
		list.unshift(...orphans)
		return list
	}

	getMessages () {
		if (!this.selectedChannel || this.selectedChannel.type !== 0) {
			this.messagesBox.setContent('\n{center}{bold}{red-fg}There are no messages here.{/}')
			return
		}
		const id = this.selectedChannel.id
		if (!this.messageCache[id]) {
			this.messagesBox.setContent('\n{center}{bold}Loading...{/}')
			this.screen.render()
			c.getMessages(id).then(messages => {
				messages = messages.sort((a, b) => parseInt(a.id, 10) - parseInt(b.id, 10))
				this.messageCache[id] = messages
				this.displayMessages()
			}, err => {
				this.messageCache[id] = 1
				this.displayMessages()
			})
		} else {
			this.displayMessages()
		}
	}

	displayMessages () {
		const messages = this.messageCache[this.selectedChannel.id]
		this.messagesBox.setContent('')
		if (messages === 1) {
			this.messagesBox.setContent("\n{center}{bold}{red-fg}You don't have permission to view this channel.{/}")
			this.screen.render()
			return
		}
		let oldChildBase = this.messagesBox
		for (let msg of messages) {
			this.messagesBox.pushLine(this.messageLine(msg))
		}
		this.screen.render()
	}

	messageLine (msg) {
		let author = blessed.escape(msg.author.nick || msg.author.username).substr(0, config.nameLength).padStart(config.nameLength)
		if (msg.author.id === c.user.id) {
			author = `{bold}${author}`
		}

		const maxMessageWidth = this.messagesBox.width - config.nameLength - 1 - 2
		let content = blessed.escape(msg.content)
		content = content.split('\n').map((contentLine, contentLineIndex) => {
			return this.wrappedLines(contentLine, maxMessageWidth).map((visualLine, visualLineIndex) => {
				if (contentLineIndex === 0 && visualLineIndex === 0) return visualLine
				return Array(config.nameLength + 1).fill(' ').join('') + visualLine
			}).join('\n')
		}).join('\n')
		content = this.addMessageColors(content)

		return `{yellow-fg}${author}{/} ${content}`
	}

	addMessageColors (message) {
		return message
			.replace(/<(#|@[!&]?)(\d+)>|@everyone|@here/g, '{bold}{cyan-fg}$&{/}') // Highlight all mentions
			.replace(/<@(!?)(\d+)>/g, (match, useNick, id) => { // Replace user mentions with username/nick
				const member = this.selectedGuild.members.get(id)
				if (member) return escapeSubs`@${useNick ? member.nick : member.username}`
				return match
			})
			.replace(/<#(\d+)>/g, (match, id) => { // Replace channel mentions with channel name
				const channel = this.selectedGuild.channels.get(id)
				if (channel && channel.type === 0) return escapeSubs`#${channel.name}`
				return `#deleted-channel`
			})
			.replace(/<@&(\d+)>/g, (match, id) => { // Replace role mentions
				const role = this.selectedGuild.roles.get(id)
				if (role) return escapeSubs`@${role.name}`
				return `@deleted-role`
			})
			.replace(/<(a?):([a-z0-9_]+):(\d+)>/gi, (animated, match, name, id) => { // Replace emotes
				return escapeSubs`{green-fg}:${name}:{/}`
			})
	}

	// https://stackoverflow.com/a/14502311
	wrappedLines (str, width) {
	    if (str.length>width) {
				let p = width
				while (p && str[p] !== ' ') {
					p--
				}
				if (!p) p = width
				const left = str.substring(0, p)
				const right = str.substring(p+1)
				return [left, ...this.wrappedLines(right, width)]
	    }
	    return [str]
	}

	pushMessage (msg) {
		if (!this.messageCache[msg.channel.id]) return
		this.messageCache[msg.channel.id].push(msg)
		console.error(msg.channel.id, this.selectedChannel.id)
		if (this.selectedChannel.id === msg.channel.id) this.displayMessages()
	}
}

const ui = new DiscordInterface()
console.error('Made UI')
const messageCache = {}

c.on('ready', () => {
	updateGuildsFromBot()
	ui.screen.title = `Discord CLI - ${c.user.username}#${c.user.discriminator} - ${c.guilds.size} guilds`
	// ui.currentUserName.setContent(escapeSubs`{yellow-fg}{bold}${forceLength(c.user.username, config.nameLength)}{/}`)
})
function updateGuildsFromBot () {
	if (c.bot) {
		ui.guilds = [...c.guilds.values()]
	} else {
		ui.guilds = c.userSettings.guild_positions.map(i => c.guilds.get(i))
	}
	ui.updateSelectedGuildFromList()
	ui.updateSelectedChannelFromList()
}

// Cache incoming messages if they're in a channel we've started caching
c.on('messageCreate', msg => {
	console.error('message:', '#' + msg.channel.name, msg.content)
	ui.pushMessage(msg)
})

c.on('messageEdit', (msg, oldMsg) => {
	// TODO
})

c.on('messageDelete', oldMsg => {
	// TODO
})

c.on('error', e => console.error(e.message))

c.connect()
