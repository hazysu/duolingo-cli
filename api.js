const fs = require('fs')
const axios = require('axios')
let globalCacheDir

async function waitForModules() {
    if (globalCacheDir&&cacheDir) return true
    globalCacheDir = (await import('global-cache-dir')).default
    cacheDir = await globalCacheDir('duolingo-cli')
}

let jwt
let user
let version
let cacheDir
const USERAGENT = "Mozilla/5.0 (X11; Linux x86_64; rv:97.0) Gecko/20100101 Firefox/97.0"

async function request(url, data, method, extraHeaders) {
    method = method||((data)?'POST':'GET')
    let response
    let headers = extraHeaders||{}
    headers['User-Agent'] = USERAGENT
    if (jwt) headers['Authorization'] = `Bearer ${jwt}`
    try {
        response = await axios(url, {
            method,
            headers,
            data: data
        })
    } catch (error) {
        console.log(error)
        throw new Error(`Axios Error happened on URL "${url}"`)
    }
    return {
        headers: response.headers,
        data: response.data
    }
}

async function credentialsSaved() {
    await waitForModules()
    return (fs.existsSync(`${cacheDir}/.user.json`) && fs.existsSync(`${cacheDir}/.jwt`))
}

async function logout() {
    await waitForModules()
    if (!await credentialsSaved()) {
        console.log(`Not logged in, cannot log out.`)
        return
    }
    await fs.promises.rm(`${cacheDir}/.jwt`)
    await fs.promises.rm(`${cacheDir}/.user.json`)
}

async function login(credentials) {
    await waitForModules()
    if (await credentialsSaved()) {
        jwt = await fs.promises.readFile(`${cacheDir}/.jwt`, 'utf-8')
        user = JSON.parse(await fs.promises.readFile(`${cacheDir}/.user.json`, 'utf-8'))
        return
    }
    let loginData = await request('https://www.duolingo.com/login', {
        login: credentials.username,
        password: credentials.password
    })
    jwt = loginData.headers.jwt
    await fs.promises.writeFile(`${cacheDir}/.jwt`, jwt, 'utf-8')
    user = (await request(`https://www.duolingo.com/users/${encodeURIComponent(loginData.data.username)}`)).data
    fs.promises.writeFile(`${cacheDir}/.user.json`, JSON.stringify(user))
}

function getUserDetails() {
    return {
        id: user.id,
        username: user.username,
        email: user.email,
        bio: user.bio,
        learning_language_string: user.learning_language_string
    }
}

async function getVersion() {
    if (version) return version
    let duolingoHomeHtml = (await axios.get('https://www.duolingo.com/')).data
    let versionDat = duolingoHomeHtml.split('window.duo.version=')[1].split(',')[0]
    version = versionDat.replace(/\"/gm, '')
    return version
}

async function getCurrentCourse() {
    user.currentCourse = (await request(`https://www.duolingo.com/2017-06-30/users/${encodeURIComponent(user.id)}?${new URLSearchParams({ fields: 'currentCourse' })}`)).data.currentCourse
    return user.currentCourse
}

async function getSkill(details, level, lesson) {
    let sessionData = (await request(`https://www.duolingo.com/2017-06-30/sessions`, {
        "challengeTypes": ["translate", "select", "match"],
        "fromLanguage": "en",
        "isFinalLevel": false,
        "juicy": true,
        levelIndex: level || 0,
        levelSessionIndex: lesson || 0,
        "learningLanguage": user.currentCourse.learningLanguage,
        "skillId": details.id,
        "type": "LESSON",
        "speakIneligibleReasons": "recognizer_unavailable"
    })).data
    await sendBatchRequest(makeSessionBatch('session_start', sessionData, { skillInfo: details }))
    return sessionData
}

async function endSkill(session, details, data) {
    let answerPut = Object.assign({
        "heartsLeft": 0,
        "startTime": Math.floor(data.startTime/1000),
        "enableBonusPoints": true,
        "endTime": Math.floor(data.endTime/1000),
        "failed": false,
        "maxInLessonStreak": session.challenges.length,
        "shouldLearnThings": true
    }, session)
    for (let i = 0; i < answerPut.challenges.length; i++) {
        if (data.challenges[i].grader) delete data.challenges[i].grader
        Object.assign(answerPut.challenges[i], data.challenges[i])
    }
    let putReq = await request(`https://www.duolingo.com/2017-06-30/sessions/${encodeURIComponent(session.id)}`, answerPut, 'PUT', {
        'Idempotency-Key': session.id
    })
    let extraDat = {
        skillInfo: details
    }
    await sendBatchRequest(makeSessionBatch('session_end_attempt', session, extraDat))
    extraDat = {
        skillInfo: details,
        extraAttributes: putReq.trackingProperties
    }
    if (session.lessonIndex == details.lessons) await sendBatchRequest(makeSessionBatch('skill_leveled_up', session, extraDat))
    await sendBatchRequest(makeSessionBatch('session_end', session, Object.assign({
        "num_mistakes_completed": 0,
        "contained_listen_challenge": false,
        "contained_speak_challenge": false,
        "disabled_listen_challenges": false,
        "disabled_speak_challenges": false,
        "num_challenges_skipped": 0,
        "num_characters_shown": 8,
        "num_end_screens": 2,
        "num_explanation_opens": 0,
        "num_placement_starts": 0,
        "speak_count": 0,
        "speak_ineligible": true,
        "speak_ineligible_reasons": "recognizer_unavailable"
    }, extraDat)))
    await sendBatchRequest(makeSessionBatch('session_end_summary_show', session, extraDat))
    await sendBatchRequest(makeSessionBatch('session_end_message_dismiss_clicked', session, extraDat))
}

async function makeSessionBatch(type, session, data) {
    let obj = {
        "event_type": type,
        "event_timestamp": Date.now(),
        "attributes": {
            "$os": "Linux",
            "$browser": "Firefox",
            "$current_url": `https://www.duolingo.com/skill/${session.learningLanguage}/${data.skillInfo.urlName}/${session.lessonIndex + 1}`,
            "$browser_version": 97,
            "$screen_height": 1080,
            "$screen_width": 1920,
            "mp_lib": "web",
            "$lib_version": "2.21.0d",
            "$initial_referrer": "$direct",
            "$initial_referring_domain": "$direct",
            "distinct_id": user.distinct_id,
            "$app_version": "12a6e3f",
            "Client": "web",
            "client_utc_datetime": Math.floor(Date.now() / 1000),
            "cn_extension": false,
            "from_internet_org": false,
            "logged_in": true,
            "mobile": false,
            "mobile_web_view": false,
            "prefers_reduced_motion": false,
            "product": "learning_app",
            "time": Math.floor(Date.now() / 1000),
            "user_agent": USERAGENT,
            "is_google_tag_manager_enabled": false,
            "email_opt_out": false
        },
        "client": {
            "client_id": "web-excess"
        }
    }
    Object.assign(obj.attributes, session.trackingProperties)
    Object.assign(obj.attributes, user.tracking_properties)
    Object.assign(obj.attributes, user.currentCourse.trackingProperties)
    Object.assign(obj.attributes, data.extraAttributes)
    return obj
}

async function postAnswer(skill, challengeIndex, data) {
    let challenge = skill.challenges[challengeIndex]
    let batch = {
        "challenge_response_timestamp": Date.now(),
        "client": "web",
        "app_version": await getVersion(),
        "challenge_response_tracking_properties": challenge.challengeResponseTrackingProperties,
        "content_id": challenge.metadata.solution_key,
        "correct": data.correct,
        "from_language": skill.fromLanguage,
        "guess": data.guess,
        "hinted_words": [],
        "item_type": challenge.metadata.specific_type,
        "learning_language": skill.learningLanguage,
        "level_index": data.level,
        "order_index": challengeIndex,
        "prompt": challenge.prompt,
        "repetition_number": 0,
        "session_id": skill.trackingProperties.activity_uuid,
        "session_type": "lesson",
        "skill_id": skill.trackingProperties.skill_id,
        "skill_tree_id": skill.trackingProperties.skill_tree_id,
        "skipped": false,
        "time_taken": data.timeTaken,
        "user_id": getUserDetails().id
    }
    switch (batch.item_type) {
        case 'name_example':
            batch.tagged_kc_ids = [
                challenge.metadata.solution_key
            ]
            break;
        case 'tap':
            batch.compact_translations = challenge.compactTranslations
            batch.distractors = challenge.wrongTokens
            batch.tagged_kc_ids = challenge.taggedKcIds
            break
    }
    await sendBatchRequest('challenge_response', batch)
}

async function sendBatchRequest(...args) {
    let batches
    let name
    if (args.length == 1) {
        batches = args[0]
    } else {
        name = args[0]
        batches = args[1]
    }
    if (!Array.isArray(batches)) batches = [batches]
    let url = (name) ? `https://excess.duolingo.com/${name}/batch` : `https://excess.duolingo.com/batch`
    let req = await request(url, batches)
    if (req.data.startsWith('Successfully')) return
    else {
        console.log('Something went wrong while talking to Duolingo...')
        console.log(req.data)
        throw new Error('Unsuccessful batch response')
    }
}

module.exports = {
    credentialsSaved,
    login,
    logout,
    getUserDetails,
    getCurrentCourse,
    getSkill,
    postAnswer,
    endSkill
}
