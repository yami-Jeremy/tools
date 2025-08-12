import { createRouter, createWebHistory } from 'vue-router'
import Home from '../views/Home.vue'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: Home
  },
  {
    path: '/timestamp',
    name: 'Timestamp',
    component: () => import('../views/Timestamp.vue')
  },
  {
    path: '/json',
    name: 'Json',
    component: () => import('../views/Json.vue')
  },
  {
    path: '/docs',
    name: 'Docs',
    component: () => import('../views/Docs.vue')
  },
  {
    path: '/database',
    name: 'Database',
    component: () => import('../views/Database.vue')
  },
  {
    path: '/im_detail',
    name: 'Im',
    component: () => import('../views/ImDetail.vue')
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router 