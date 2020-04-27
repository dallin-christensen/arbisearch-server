require('dotenv').config()
const puppeteer = require('puppeteer')
const express = require('express')
const nodemailer = require('nodemailer')
const stayAlive = require('./stayAlive');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL,
    pass: process.env.PASS
  }
})

const TO_EMAILS = 'christensen.dallin@gmail.com, bustindustin959@gmail.com'


const app = express();

const siteMeta = {
    sportsBetting: {
      urls: {
        mma: 'https://www.sportsbetting.ag/sportsbook/martial-arts/mma',
        boxing: 'https://www.sportsbetting.ag/sportsbook/boxing/bouts',
        tableTennis: 'https://www.sportsbetting.ag/sportsbook/table-tennis/russia',
        tennis: 'https://www.sportsbetting.ag/sportsbook/tennis/exhibition',
        darts: 'https://www.sportsbetting.ag/sportsbook/darts/pdc'
      },
    },
    myBookie: {
      urls: {
        mma: 'https://mybookie.ag/sportsbook/ufc/',
        boxing: 'https://mybookie.ag/sportsbook/boxing/',
        tableTennis: 'https://mybookie.ag/sportsbook/table-tennis/',
      }
    },
    betNow: {
      urls: {
        mma: 'https://www.betnow.eu/sportsbook-info/boxing/ufc',
        test: 'https://www.betnow.eu/sportsbook-info/boxing/ufc',
        boxing: 'https://www.betnow.eu/sportsbook-info/boxing/boxing',
      }
    },
    bovada: {
      urls: {
        mma: 'https://www.bovada.lv/sports/ufc-mma',
        boxing: 'https://www.bovada.lv/sports/boxing',
        tableTennis: 'https://www.bovada.lv/sports/table-tennis',
        darts: 'https://www.bovada.lv/sports/darts',
      }
    },
    gtBets: {
      urls: {
        mma: 'https://www.gtbets.eu/wagering1.asp?mode=lines&league=BOX&lg=1',
        boxing: 'https://www.gtbets.eu/wagering1.asp?mode=lines&league=BOX&lg=1',
        tableTennis: 'https://www.gtbets.eu/wagering1.asp?mode=lines&league=Tab%20Ten&lg=1',
      }
    }
  }
  
const scrapeData = async ({ eventType = 'mma', opposing = true }) => {
  const allEventsData = []

  const areUnderdogOdds = (odds) => odds && odds.includes('+')

  const getFirstAndLastName = (fullName, lastNameFirst = false) => {
    const noJr = fullName.replace('jr', '').replace('junior', '').trim()
    const splitName = noJr.split(' ')
    const splitNameTrimmed = splitName.map((section) => section.trim().replace(/[^\w\s]/g,'').toLowerCase());
    return {
      firstName: lastNameFirst ? splitNameTrimmed[splitNameTrimmed.length - 1] : splitNameTrimmed[0],
      lastName: lastNameFirst ? splitNameTrimmed[0] : splitNameTrimmed[splitNameTrimmed.length - 1],
    }
  }

  const buildFightPropName = (eventOne, eventTwo) => {
    const names = [
      `${eventOne.firstName.toLowerCase()}+${eventOne.lastName.toLowerCase()}`,
      `${eventTwo.firstName.toLowerCase()}+${eventTwo.lastName.toLowerCase()}`
    ]
    names.sort((a, b) => a.localeCompare(b))
    return names.join('_v_')
  }

  const toEventShape = (fighterData, siteName) => {
    const eventData = {}
    eventData.fighterData = fighterData
      .map((event) => event.map((fighterLine) => ({
        ...getFirstAndLastName(fighterLine.name, fighterLine.name.includes(',')),
        odds: fighterLine.odds,
        underdog: areUnderdogOdds(fighterLine.odds)
      })))
      .reduce((accObj, event) => {
        const propName = buildFightPropName(event[0], event[1])

        const getUnderdog = (fighterLines) => {
          const underdogFighter = fighterLines.find((fighterLine) => fighterLine.underdog)
          return underdogFighter && underdogFighter.lastName
        }

        return {
          ...accObj,
          [propName]: {
            fighters: event,
            underdog: getUnderdog(event) || null,
          },
        }
      }, {})

      eventData.siteName = siteName
      eventData.siteUrl = siteMeta[siteName].urls[eventType]
      return eventData
  } 

  const findOpposingOdds = ({ commonProps, siteOneEventsData, siteTwoEventsData, siteNames, siteUrls }) => {
    // const siteNames = [siteOneEventsData.siteName, siteTwoEventsData.siteName]
    const opposingOddsMatchNames = commonProps.map((propName) => {
      const siteOneUnderdog = siteOneEventsData[propName].underdog
      const siteTwoUnderdog = siteTwoEventsData[propName].underdog

      return {
        eventName: propName,
        isOpposing: siteOneUnderdog && siteTwoUnderdog && siteOneUnderdog !== siteTwoUnderdog,
      }
    }).filter((event) => opposing ? event.isOpposing : !event.isOpposing).map(event => event.eventName)

    return { siteNames, siteUrls, matchNames: opposingOddsMatchNames }
  }


  const findAllOpposingOdds = (allEventsData) => {
    const allOpposingOdds = []

    const recursiveFinder = (i) => {
      const mainEventData= allEventsData[i]
      const remainingEventsData = allEventsData.slice(i + 1)

      remainingEventsData.forEach((eventDataIterable) => {
        const mainEventDataPropNames = Object.getOwnPropertyNames(mainEventData.fighterData)
        const iterableEventDataPropNames = Object.getOwnPropertyNames(eventDataIterable.fighterData)
        const commonProps = mainEventDataPropNames.filter(value => iterableEventDataPropNames.includes(value))

        const opposingOddsData = findOpposingOdds({
          commonProps: commonProps,
          siteOneEventsData: mainEventData.fighterData,
          siteTwoEventsData: eventDataIterable.fighterData,
          siteNames: [mainEventData.siteName, eventDataIterable.siteName],
          siteUrls: [mainEventData.siteUrl, eventDataIterable.siteUrl],
        })

        // if (opposingOddsData.matchNames.length) allOpposingOdds.push(opposingOddsData)
        allOpposingOdds.push(opposingOddsData)
      })

      if (i < allEventsData.length - 2) recursiveFinder(i + 1)
    }

    recursiveFinder(0)
    return allOpposingOdds
  }






  console.log('launching headless browser...')
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();

  console.log('setting user agent...')
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/61.0.3163.100 Safari/537.36');



  if (siteMeta.sportsBetting.urls[eventType]) {
    console.log('requesting sportsbetting.ag...')
    await page.goto(siteMeta.sportsBetting.urls[eventType], {waitUntil: 'networkidle2'}).catch(console.warn);
    
    console.log('scraping event data...')
    const sportsBettingEventsDataArray = await page.evaluate(() => 
      Array.from(document.querySelectorAll('tbody.event')).map(event => 
        Array.from(event.querySelectorAll('tr')).map(fighterLine => {
          const nameNode = fighterLine.querySelector('td.col_teamname')
          const oddsNode = fighterLine.querySelector('td.moneylineodds')
  
          return {
            name: nameNode && nameNode.innerText.toLowerCase(),
            odds: oddsNode && oddsNode.innerText,
          }
        }).filter(line => line.odds)
      ).filter(event => event[0])
    ).catch(console.warn)
    allEventsData.push(toEventShape(sportsBettingEventsDataArray, 'sportsBetting'))
  }






  if (siteMeta.myBookie.urls[eventType]) {
    console.log('requesting mybookie.ag...')
    await page.goto(siteMeta.myBookie.urls[eventType], {waitUntil: 'networkidle2'}).catch(console.warn);
  
    console.log('scraping event data...')
    await page.waitForSelector('div.sportsbook-lines' , { timeout: 5000 }).catch(console.warn)
    const myBookieEventsDataArray = await page.evaluate(() => 
      Array.from(document.querySelectorAll('div.sportsbook-lines')).map(event => {
        const fightersNames = Array.from(event.querySelectorAll('p.team-name')).map(fighterNamesNodes => fighterNamesNodes.title)
        const fightersOdds = Array.from(event.querySelectorAll('div.money-lines span')).map(fighterOddsNodes => fighterOddsNodes.innerText)
  
        return fightersNames.map((fighterName, i) => ({ name: fighterName.toLowerCase(), odds: fightersOdds[i] }))
      }).filter(event => event.length)
    ).catch(console.warn)
    allEventsData.push(toEventShape(myBookieEventsDataArray, 'myBookie'))
  }






  if (siteMeta.betNow.urls[eventType]) {
    console.log('requesting betNow.eu...')
    await page.goto(siteMeta.betNow.urls[eventType], {waitUntil: 'networkidle2'}).catch(console.warn);
  
    console.log('scraping event data...')
    const betNowEventsDataArray = await page.evaluate(() => {
      const ungroupedFighters = Array.from(document.querySelectorAll('div.odd-info-teams')).map(fighterLine => {
        const fighterName = fighterLine.querySelector('span.team-name').innerText.replace(/[0-9]/g, '').trim().toLowerCase()
        const fighterOdds = fighterLine.querySelector('div.col-xs-3 span').innerText
        return {
          name: fighterName,
          odds: fighterOdds,
        }
      })
  
      return ungroupedFighters.reduce((accArr, fighter, i) => {
        if (i % 2 || i === (ungroupedFighters.length - 1)) return accArr
  
        return [
          ...accArr,
          [
            fighter,
            ungroupedFighters[i+1],
          ]
        ]
      }, [])
  
    }).catch(console.warn)
    allEventsData.push(toEventShape(betNowEventsDataArray, 'betNow'))
  }



  if (siteMeta.bovada.urls[eventType]) {
    console.log('requesting bovada.lv...')
    await page.goto(siteMeta.bovada.urls[eventType], {waitUntil: 'networkidle2'}).catch(console.warn);
    
    console.log('scraping event data...')
    const bovadaEventsDataArray = await page.evaluate(() =>
      Array.from(document.querySelectorAll('section.coupon-content')).map(event => {
        const fighterNames = Array.from(event.querySelectorAll('span.name')).map(name => name.innerText)
        const fighterOdds = Array.from(event.querySelectorAll('span.bet-price')).map(odds => odds.innerText).filter(odds => !odds.includes('('))

  
        return fighterNames.map((name, i) => ({ name, odds: fighterOdds[i] }))
      })
    ).catch(console.warn)
    allEventsData.push(toEventShape(bovadaEventsDataArray, 'bovada'))
  }




  if (siteMeta.gtBets.urls[eventType]) {
    console.log('requesting gtbets.eu...')
    await page.goto(siteMeta.gtBets.urls[eventType], {waitUntil: 'networkidle2'}).catch(console.warn);
    
    console.log('scraping event data...')
    // await page.waitForSelector('tr.wagering-event-competitor' , { timeout: 1000 })
    await page.waitForSelector('td.wagering-event-team' , { timeout: 5000 }).catch(console.warn)
    const gtBetsEventsDataArray = await page.evaluate(() =>
      Array.from(document.querySelectorAll('tbody.wagering-events')).map(event => 
        Array.from(event.querySelectorAll('tr.wagering-event-competitor')).map(fighterLine => {
          const nameNode = fighterLine.querySelector('td.wagering-event-team')
          const oddsNode = fighterLine.querySelector('label.wagering-event-trigger span')
  
          return {
            name: nameNode && nameNode.innerText && nameNode.innerText.toLowerCase(),
            odds: oddsNode && oddsNode.innerText,
          }
        }).filter(line => line.odds)
      ).filter(event => event[0])
    ).catch(console.warn)
    allEventsData.push(toEventShape(gtBetsEventsDataArray, 'gtBets'))
  }

  console.log("\x1b[32m", `${eventType} scraping complete`, '\x1b[0m')


  const allOpposingOdds = findAllOpposingOdds(allEventsData)

  await browser.close();
  return allOpposingOdds
};

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*"); // update to match the domain you will make the request from
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});


app.get('/api/:eventType', async (req, res) => {
    const eventType = req.params.eventType
    const queryType = req.query.queryType
    const data = await scrapeData({ eventType, opposing: queryType !== 'matching' })
    res.set('Cache-Control', 'public, max-age=300, s-maxage=600')
    res.send(data)
})

const scrapeAndEmail = async () => {
  const eventTypes = ['mma', 'boxing', 'tableTennis', 'darts']
  const allEventTypesData = []
  const positiveData = []


  for (const eventType of eventTypes) {
    const data = await scrapeData({ eventType, opposing: true }).catch(console.error)
    allEventTypesData.push({ data, eventType })
  }




  allEventTypesData.forEach(eventType => {
    eventType.data.forEach(event => {
      if (event.matchNames.length) {
        positiveData.push({...event, eventType: eventType.eventType})
      }
    })
  })
  

  const date = new Date();
  const n = date.toDateString();
  const time = date.toLocaleTimeString();

  console.log("\x1b[32m", `auto-scrape complete: ${time} ${n}`, '\x1b[0m')



  if (positiveData.length) {
    const messageStrings = []

    const capitalizeFirstLetter = (string) => string.charAt(0).toUpperCase() + string.slice(1);

    const toReadableMatchname = (matchName) => {
      return matchName.split('_').map((word) => capitalizeFirstLetter(word)).join('   ')
        .split('+').map((word) => capitalizeFirstLetter(word)).join(' ')
    }



    positiveData.forEach(event => {
      messageStrings.push(`
event type: ${event.eventType}
site names: ${event.siteNames[0]} ${event.siteNames[1]},
competitors: \n${event.matchNames.map(matchName => `${toReadableMatchname(matchName)}`).join('\n')}
site urls: ${event.siteUrls[0]} ${event.siteUrls[1]}

      `)
    })

    const mailOptions = {
      from: 'arbisearchmail@gmail.com',
      to: TO_EMAILS,
      subject: 'you have arbisearch hits',
      text: messageStrings.join('\n')
    }

    const mailResponse = await transporter.sendMail(mailOptions)
      .catch((err) => {
        console.error('mail failed to send: ', err)
      })

    console.log('mail sent successfully!', mailResponse)
  }
}

const testMail = async () => {
  console.log('>>> ',process.env.EMAIL)
  const mailOptions = {
    from: 'arbisearchmail@gmail.com',
    to: TO_EMAILS,
    subject: 'inital email working :)',
    text: 'arbisearch automation ready.'
  }

  const mailResponse = await transporter.sendMail(mailOptions)
    .catch((err) => {
      console.error('mail failed to send: ', err)
    })

  console.log('mail sent successfully!', mailResponse)
}

const checkEveryHour = () => {
  testMail()
  scrapeAndEmail()

  setInterval(() => {
    scrapeAndEmail()
  }, 3600000)
}
checkEveryHour()
stayAlive.startKeepAlive()

const port = process.env.PORT || 4000
app.listen(port, () => console.log(`listening on port ${port}`));