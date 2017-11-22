const ChewbPassport = require("chewb-passport")
const colors = require("colors")

module.exports = app => {
  const host = process.env.HOST || "localhost"

  const hostUrl =
    process.env.NODE_ENV === "production"
      ? process.env.FRONT_END
      : `${process.env.PROTOCALL}://${host}:${process.env.CHOO_PORT}/`


  const redirectURL =
    process.env.NODE_ENV === "production"
      ? process.env.FRONT_END
      : `/`

  console.log(colors.green(`hostUrl: ${hostUrl}`));

  let strats = [
    {
      name: "facebook",
      clientId: process.env.FACEBOOK_ID,
      clientSecret: process.env.FACEBOOK_SECRET,
      authUrl: "/login/facebook",
      redirectUrl: `login/facebook/return`,
      callbackUrl: `${hostUrl}login/facebook/success`,
    },
    {
      name: "instagram",
      scope: ["public_content"],
      clientId: process.env.INSTAGRAM_ID,
      clientSecret: process.env.INSTAGRAM_SECRET,
      authUrl: "/login/instagram",
      redirectUrl: `login/instagram/return`,
      callbackUrl: `${hostUrl}login/instagram/success`,
    },
    {
      name: "youtube",
      scope: [
        "https://www.googleapis.com/auth/youtube.upload",
        "https://www.googleapis.com/auth/youtube",
        "https://www.googleapis.com/auth/youtubepartner",
        "https://www.googleapis.com/auth/youtube.readonly",
        "https://www.googleapis.com/auth/youtube.force-ssl",
      ],
      clientId: process.env.YOUTUBE_ID,
      clientSecret: process.env.YOUTUBE_SECRET,
      authUrl: "/login/youtube",
      redirectUrl: `login/youtube/return`,
      callbackUrl: `${hostUrl}login/youtube/success`,
    },
  ]

  let chewbPassport = new ChewbPassport(app, strats, {
    host: hostUrl,
    baseRoute: "",
    logOut: true,
  })
}
