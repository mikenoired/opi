import { router } from '../trpc'
import { authRouter } from './auth'
import { contentRouter } from './content'

export const appRouter = router({
  auth: authRouter,
  content: contentRouter,
})

export type AppRouter = typeof appRouter 