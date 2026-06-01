'use client'

import { useState, type FormEvent, type MouseEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { SignInInput, ApiResponse, SessionData } from '@/lib/infrastructure/auth/types'

function safeRedirectPath(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/content'
  return value
}

function getRedirectPathFromLocation(): string {
  if (typeof window === 'undefined') return '/content'
  return safeRedirectPath(new URLSearchParams(window.location.search).get('redirect'))
}

export default function SignInPage() {
  const router = useRouter()
  const [formData, setFormData] = useState<SignInInput>({
    email: '',
    password: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      const response = await fetch('/api/auth/sign-in', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      const data: ApiResponse<SessionData> = await response.json()

      if (!data.success) {
        setError((data as { success: false; error: { message: string } }).error.message)
        setIsLoading(false)
        return
      }

      router.push(getRedirectPathFromLocation())
      router.refresh()
    } catch {
      setError('An unexpected error occurred')
      setIsLoading(false)
    }
  }

  const handleGoogleSignIn = () => {
    const redirectTo = getRedirectPathFromLocation()
    window.location.href = `/api/auth/google?redirect=${encodeURIComponent(redirectTo)}`
  }

  const handleCreateAccount = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    const redirectTo = getRedirectPathFromLocation()
    router.push(`/sign-up?redirect=${encodeURIComponent(redirectTo)}`)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-[#1a2530] px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
            Sign in to your account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
            Or{' '}
            <Link
              href="/sign-up"
              onClick={handleCreateAccount}
              className="font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300"
            >
              create a new account
            </Link>
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div
              role="alert"
              aria-live="polite"
              className="rounded-md border border-red-400 dark:border-red-500/50 bg-red-50 dark:bg-red-500/15 p-4"
            >
              <div className="flex items-start gap-2">
                <svg
                  className="w-4 h-4 mt-0.5 shrink-0 text-red-700 dark:text-red-300"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <div className="text-sm font-medium text-red-900 dark:text-red-200">
                  {error}
                </div>
              </div>
            </div>
          )}
          <div className="space-y-4 rounded-md shadow-sm">
            <div>
              <label htmlFor="email" className="sr-only">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                className="relative block w-full rounded-t-md border-0 px-3 py-2 bg-white dark:bg-black/30 text-gray-900 dark:text-gray-100 ring-1 ring-inset ring-gray-300 dark:ring-white/15 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                placeholder="Email address"
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={formData.password}
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
                className="relative block w-full rounded-b-md border-0 px-3 py-2 bg-white dark:bg-black/30 text-gray-900 dark:text-gray-100 ring-1 ring-inset ring-gray-300 dark:ring-white/15 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                placeholder="Password"
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="group relative flex w-full justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50"
            >
              {isLoading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300 dark:border-white/15" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-gray-50 dark:bg-[#1a2530] px-2 text-gray-500 dark:text-gray-400">Or continue with</span>
            </div>
          </div>

          <div>
            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="group relative flex w-full justify-center rounded-md border border-gray-300 dark:border-white/15 bg-white dark:bg-black/30 px-3 py-2 text-sm font-semibold text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            >
              <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Sign in with Google
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
