/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: [
      'i.scdn.co',
      'img.youtube.com',
      'i1.sndcdn.com',
      'is1-ssl.mzstatic.com',
      'i.ytimg.com',
      'lh3.googleusercontent.com',
      'yt3.ggpht.com'
    ],
  },
}

module.exports = nextConfig
