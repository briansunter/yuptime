import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Yuptime',
  description: 'Kubernetes-native monitoring where all configuration is CRDs',

  // Exclude archived/old docs
  srcExclude: ['_archive/**'],

  // Ignore dead links for localhost URLs
  ignoreDeadLinks: [
    /^http:\/\/localhost/,
  ],

  head: [
    ['link', { rel: 'icon', href: '/favicon.ico' }],
    ['meta', { name: 'theme-color', content: '#3eaf7c' }],
    ['meta', { name: 'og:type', content: 'website' }],
    ['meta', { name: 'og:title', content: 'Yuptime - Kubernetes-native Monitoring' }],
    ['meta', { name: 'og:description', content: 'Monitor your infrastructure with Kubernetes CRDs. GitOps-native, database-free, and fully declarative.' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
  ],

  // Deploy to GitHub Pages
  base: '/yuptime/',

  // Theme configuration
  themeConfig: {
    logo: '/logo.svg',

    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Reference', link: '/reference/crds/monitor' },
      { text: 'Examples', link: '/examples/' },
      {
        text: 'v0.0.18',
        items: [
          { text: 'Changelog', link: 'https://github.com/briansunter/yuptime/releases' },
          { text: 'Contributing', link: 'https://github.com/briansunter/yuptime/blob/master/CONTRIBUTING.md' },
        ],
      },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Introduction',
          items: [
            { text: 'What is Yuptime?', link: '/guide/what-is-yuptime' },
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: 'Architecture', link: '/guide/architecture' },
          ],
        },
        {
          text: 'Installation',
          items: [
            { text: 'Timoni (Recommended)', link: '/guide/installation/timoni' },
            { text: 'Helm', link: '/guide/installation/helm' },
            { text: 'kubectl', link: '/guide/installation/kubectl' },
          ],
        },
        {
          text: 'Core Concepts',
          items: [
            { text: 'Monitors', link: '/guide/monitors' },
            { text: 'Alerting', link: '/guide/alerting' },
            { text: 'Suppressions', link: '/guide/suppressions' },
            { text: 'Metrics', link: '/guide/metrics' },
          ],
        },
        {
          text: 'Advanced',
          items: [
            { text: 'GitOps Integration', link: '/guide/gitops' },
            { text: 'High Availability', link: '/guide/high-availability' },
            { text: 'Troubleshooting', link: '/guide/troubleshooting' },
          ],
        },
      ],
      '/reference/': [
        {
          text: 'CRD Reference',
          items: [
            { text: 'Monitor', link: '/reference/crds/monitor' },
            { text: 'MonitorSet', link: '/reference/crds/monitorset' },
            { text: 'MaintenanceWindow', link: '/reference/crds/maintenancewindow' },
            { text: 'Silence', link: '/reference/crds/silence' },
            { text: 'YuptimeSettings', link: '/reference/crds/settings' },
          ],
        },
        {
          text: 'Monitor Types',
          items: [
            { text: 'HTTP', link: '/reference/monitors/http' },
            { text: 'TCP', link: '/reference/monitors/tcp' },
            { text: 'DNS', link: '/reference/monitors/dns' },
            { text: 'Ping', link: '/reference/monitors/ping' },
            { text: 'WebSocket', link: '/reference/monitors/websocket' },
            { text: 'gRPC', link: '/reference/monitors/grpc' },
            { text: 'MySQL', link: '/reference/monitors/mysql' },
            { text: 'PostgreSQL', link: '/reference/monitors/postgresql' },
            { text: 'Redis', link: '/reference/monitors/redis' },
            { text: 'Kubernetes', link: '/reference/monitors/kubernetes' },
            { text: 'Push', link: '/reference/monitors/push' },
            { text: 'Steam', link: '/reference/monitors/steam' },
          ],
        },
        {
          text: 'Configuration',
          items: [
            { text: 'Timoni Values', link: '/reference/config/timoni' },
            { text: 'Helm Values', link: '/reference/config/helm' },
            { text: 'Environment Variables', link: '/reference/config/environment' },
          ],
        },
      ],
      '/examples/': [
        {
          text: 'Examples',
          items: [
            { text: 'All Examples', link: '/examples/' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/briansunter/yuptime' },
    ],

    footer: {
      message: 'Released under the Apache 2.0 License.',
      copyright: 'Copyright © 2024-present Brian Sunter',
    },

    editLink: {
      pattern: 'https://github.com/briansunter/yuptime/edit/master/docs/:path',
      text: 'Edit this page on GitHub',
    },

    search: {
      provider: 'local',
    },

    outline: {
      level: [2, 3],
    },
  },

  markdown: {
    lineNumbers: true,
  },
})
