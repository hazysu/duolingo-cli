let ora
const api = require('./api')
const colors = require('colors')
const enquirer = require('enquirer')
const turndown = new require('turndown')()

const marked = require('marked')
const TerminalRenderer = require('marked-terminal')
marked.setOptions({
  renderer: new TerminalRenderer()
})

async function start() {
    if (!await api.credentialsSaved()) {
        ora = (await import('ora')).default
        let credentials = await enquirer.prompt([
            {
                name: 'username',
                type: 'input',
                message: 'Username?'
            },
            {
                name: 'password',
                type: 'password',
                message: 'Password?'
            }
        ])
        let loadSpinner = ora('Logging in...').start()
        await api.login(credentials)
        loadSpinner.stop()
    } else await api.login()
    let user = await api.getUserDetails()
    console.log(`Duolingo`.green)
    console.log(``)
    console.log(`Signed in as ${colors.underline('@'+user.username)}, learning ${colors.green(user.learning_language_string)}`)
    chooseSkill()
}

async function practice(skillInfo, level, lesson) {
    level = level??skillInfo.finishedLevels
    lesson = lesson??skillInfo.finishedLessons
    let skill = await api.getSkill(skillInfo, level, lesson)
    let forceSuccess = false
    if (process.env.FORCE_SUCCESS) forceSuccess = true
    let challenges = []
    let skillStartTime = Date.now()
    for (let i = 0; i < skill.challenges.length; i++) {
        let challenge = skill.challenges[i]
        let startTime = Date.now()
        let success = false
        let guess = null
        switch (challenge.type) {
            case 'select':
                if (!forceSuccess) {
                    let choice = (await enquirer.prompt([
                        {
                            type: 'select',
                            name: 'match',
                            message: `Which of these is "${challenge.prompt}"`,
                            choices: challenge.choices.map((e, i) => {
                                return {
                                    message: e.phrase,
                                    value: i
                                }
                            }),
                            validate: (str) => {
                                if (typeof str == 'string') str = challenge.choices.findIndex(e => e.phrase==str)
                                if (str==challenge.correctIndex) {
                                    success = true
                                    guess = challenge.correctIndex
                                    return true
                                } else {
                                    return `Incorrect! The correct answer was ${challenge.choices[challenge.correctIndex].phrase}`
                                }
                            }
                        }
                    ])).match
                    guess = choice
                } else {
                    success = true
                    guess = challenge.correctIndex
                }
                break
            case 'translate':
                if (!forceSuccess) {
                    let answer = (await enquirer.prompt([
                        {
                            type: 'input',
                            name: 'translation',
                            message: `Translate: "${challenge.prompt}"`,
                            validate: (str) => {
                                str = str.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[!\.?,]/gm, '')
                                let wasCorrect = null
                                for (let j = 0; j < challenge.correctSolutions.length; j ++) {
                                    let correctSolution = challenge.correctSolutions[j].normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[!\.?,]/gm, '')
                                    if (str==correctSolution) wasCorrect = j
                                }
                                if (wasCorrect!=null) {
                                    success = true
                                    guess = challenge.correctSolutions[wasCorrect]
                                    return true
                                }
                                else {
                                    guess = str
                                    return `Incorrect! Duolingo translated this as "${challenge.correctSolutions[0]}"`
                                }
                            }
                        }
                    ]))
                } else {
                    success = true
                    guess = challenge.correctSolutions[0]
                }
                break
            case 'match':
                let cock = null
                if (!forceSuccess) {
                    let allPairs = challenge.pairs.map((e, i) => {
                        return {
                            value: i,
                            message: e.learningToken
                        }
                    }).concat(challenge.pairs.map((e, i) => {
                        return {
                            value: i,
                            message: e.fromToken
                        }
                    })).sort((a, b) => 0.5-Math.random())
                    for (let i = 0; i < challenge.pairs.length; i++) {
                        let match = (await enquirer.prompt([
                            {
                                type: 'multiselect',
                                name: 'match',
                                message: `Select two matching words.`,
                                choices: allPairs,
                                validate: (str) => {
                                    if (str.length==1) return true
                                    else {
                                        if (typeof str[0]=='string') {
                                            let learningInd = challenge.pairs.findIndex(e => e.learningToken==str[0])
                                            let fromInd = challenge.pairs.findIndex(e => e.fromToken==str[0])
                                            if (learningInd!=-1) str[0] = learningInd
                                            else if (fromInd!=-1) str[0] = fromInd
                                            else throw new Error('Something went wrong but I do not know what')
                                        }
                                        if (typeof str[1]=='string') {
                                            let learningInd = challenge.pairs.findIndex(e => e.learningToken==str[1])
                                            let fromInd = challenge.pairs.findIndex(e => e.fromToken==str[1])
                                            if (learningInd!=-1) str[1] = learningInd
                                            else if (fromInd!=-1) str[1] = fromInd
                                            else throw new Error('Something went wrong but I do not know what')
                                        }
                                        if (str[0]==str[1]) return true
                                        return `Incorrect! ${challenge.pairs[str[0]].learningToken} and ${challenge.pairs[str[0]].fromToken} are pairs. Try again!`
                                    }
                                }
                            }
                        ])).match
                        allPairs = allPairs.filter(e => e.value!=match[0])
                    }
                }
                success = true
                guess = []
                break
            default:
                console.log(`This challenge is of type "${challenge.type}",`)
                console.log(`which has not been implemented yet.`)
                console.log(challenge)
                console.log(`These types of questions should not be showing up.`)
                throw new Error('Unknown challenge')
                break
        }
        if (forceSuccess) {
            await new Promise(r => setTimeout(r, (Math.random()*500)))
            process.stdout.clearLine(0)
            process.stdout.cursorTo(0)
            process.stdout.write(`Submitting botted answers (${(((i+1)/skill.challenges.length)*100).toFixed(0)}%)`.gray)
        }
        let timeTaken = Date.now()-startTime
        challenges[i] = {
            "timeTaken": timeTaken,
            "correct": success,
            "guess": guess
        }
        if (!forceSuccess) api.postAnswer(skill, i, {
            correct: success,
            guess,
            level,
            timeTaken
        })
        if (i==skill.challenges.length-1) {
            let skillEndTime = Date.now()
            await api.endSkill(skill, skillInfo, {
                startTime: skillStartTime,
                endTime: skillEndTime,
                challenges
            })
        }
    }
    let canDoAgain = true
    let nextLesson = lesson+1
    let nextLevel = skill.levelIndex
    if (forceSuccess) console.log('')
    if (skill.lessonIndex+1<skillInfo.lessons) {
        console.log('You finished the lesson!')
    } else if (skill.levelIndex+1==skill.levels) {
        canDoAgain = false
        console.log(`You have completed ${skillInfo.name}!`)
    } else {
        nextLesson = 0
        nextLevel++
        console.log(`You finished level ${skill.levelIndex+1} of ${skillInfo.name}!`)
    }
    if (canDoAgain) {
        let action = (await enquirer.prompt([
            {
                type: 'select',
                name: 'action',
                message: 'What would you like to do now?',
                choices: [
                    {
                        message: 'Practice this skill again',
                        value: 'practice'
                    },
                    {
                        message: 'Learn another skill',
                        value: 'back'
                    }
                ]
            }
        ])).action
        switch (action) {
            case 'back':
                chooseSkill()
                break
            case 'practice':
                practice(skillInfo, nextLevel, nextLesson)
                break
        }
        return
    }
    chooseSkill()
}

async function chooseSkill() {
    let skills = []
    let skillTree = (await api.getCurrentCourse()).skills
    for (let i = 0; i < skillTree.length; i++) {
        skills = skills.concat(skillTree[i])
    }
    skills = skills.filter(e => {
        return e.accessible
    })
    let skillToPractice = (await enquirer.prompt([
        {
            type: 'select',
            name: 'skill',
            message: 'What skill do you want to practice?',
            choices: skills.map(e => {
                let percentDone = (e.finishedLevels+(e.finishedLessons/e.lessons))/(e.levels+1)
                return {
                    message: `${e.name} | ${(percentDone*100).toFixed(0)}% completed`,
                    value: e.urlName
                }
            })
        }
    ])).skill
    let selection = skills.find(e => e.urlName==skillToPractice)
    if (selection.tipsAndNotes) {
        async function askWhatToDo(prompt) {
            let action = (await enquirer.prompt([
                {
                    type: 'select',
                    name: 'action',
                    message: prompt||'How do you want to learn this skill?',
                    choices: [
                        {
                            message: 'Practice',
                            value: 'practice'
                        },
                        {
                            message: 'Read Tips',
                            value: 'tips'
                        },
                        {
                            message: 'Go back',
                            value: 'back'
                        }
                    ]
                }
            ])).action
            switch (action) {
                case 'practice':
                    practice(selection)
                    break
                case 'back':
                    chooseSkill()
                    break
                case 'tips':
                    let md = turndown.turndown(selection.tipsAndNotes)
                    console.log('')
                    console.log(marked.parse(md))
                    console.log('')
                    await askWhatToDo('What would you like to do now?')
                    break
            }
        }
        await askWhatToDo()
    } else {
        console.log('This lesson does not have tips.')
        let action = (await enquirer.prompt([
            {
                type: 'select',
                name: 'practice',
                message: `Do you want to practice "${selection.name}"?`,
                choices: [
                    {
                        message: 'Yes',
                        value: true
                    },
                    {
                        message: 'Go back',
                        value: false
                    }
                ]
            }
        ]))
        if (action.practice) practice(selection)
        else chooseSkill()
    }
}

if (process.argv.length>2) {
    switch (process.argv[2]) {
        case 'signout':
        case 'logout':
            api.logout()
            break
        default:
            console.log(`Unrecognized argument ${process.argv[2]}`)
            break
    }
} else {
    start()
}
