'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { Camera, ArrowLeft, Loader2, Save, User as UserIcon } from 'lucide-react'
import Image from 'next/image'
import { toast } from 'sonner'
import Link from 'next/link'

export default function ProfilePage() {
    const { user, loading: authLoading, refreshUser } = useAuth()
    const router = useRouter()

    const [username, setUsername] = useState('')
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
    const [updating, setUpdating] = useState(false)
    const [uploading, setUploading] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (!authLoading && !user) {
            router.push('/auth/signin')
        }

        if (user) {
            fetchProfile()
        }
    }, [user, authLoading, router])

    async function fetchProfile() {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('username, avatar_url')
                .eq('id', user?.id)
                .single()

            if (error && error.code !== 'PGRST116') {
                throw error
            }

            if (data) {
                setUsername(data.username || '')
                setAvatarUrl(data.avatar_url || null)
            } else {
                // If profile doesn't exist yet, use default metadata
                setUsername(user?.user_metadata?.display_name || user?.user_metadata?.full_name || '')
                setAvatarUrl(user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null)
            }
        } catch (error) {
            console.error('Error fetching profile:', error)
            toast.error('Failed to load profile')
        }
    }

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        try {
            setUploading(true)

            if (!e.target.files || e.target.files.length === 0) {
                throw new Error('You must select an image to upload.')
            }

            const file = e.target.files[0]
            const fileExt = file.name.split('.').pop()
            const fileName = `${user?.id}-${Math.random()}.${fileExt}`
            const filePath = `avatars/${fileName}`

            // Upload the file to "avatars" bucket
            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, file)

            if (uploadError) {
                throw uploadError
            }

            // Get public URL
            const { data: { publicUrl } } = supabase.storage
                .from('avatars')
                .getPublicUrl(filePath)

            setAvatarUrl(publicUrl)
            toast.success('Avatar uploaded!')
        } catch (error: any) {
            console.error('Error uploading avatar:', error)
            toast.error(error.message || 'Error uploading avatar')
        } finally {
            setUploading(false)
        }
    }

    const handleUpdateProfile = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
            setUpdating(true)

            const { error } = await supabase
                .from('profiles')
                .upsert({
                    id: user?.id,
                    username,
                    avatar_url: avatarUrl,
                    updated_at: new Date().toISOString(),
                })

            if (error) throw error

            // Also update auth metadata to keep it in sync for the Navbar
            const { error: authError } = await supabase.auth.updateUser({
                data: {
                    display_name: username,
                    avatar_url: avatarUrl
                }
            })

            if (authError) throw authError

            await refreshUser()
            toast.success('Profile updated successfully!')

        } catch (error: any) {
            console.error('Error updating profile:', error)
            toast.error(error.message || 'Failed to update profile')
        } finally {
            setUpdating(false)
        }
    }

    if (authLoading || !user) {
        return (
            <div className="min-h-screen bg-bg flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-accent animate-spin" />
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-bg text-text selection:bg-accent/30 selection:text-white">
            {/* Background Ambient Effects */}
            <div className="fixed inset-0 pointer-events-none -z-10">
                <div className="absolute inset-0 grid-bg opacity-[0.15]" />
                <div className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full blur-[120px] bg-accent/5 animate-pulse" />
                <div className="absolute bottom-0 left-0 w-[500px] h-[500px] rounded-full blur-[120px] bg-accent2/5" />
            </div>

            <main className="max-w-2xl mx-auto px-6 py-12">
                <Link
                    href="/dashboard"
                    className="inline-flex items-center gap-2 text-muted hover:text-text transition-colors mb-12 group"
                >
                    <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
                    <span className="font-mono-custom text-sm uppercase tracking-widest">Back to Dashboard</span>
                </Link>

                <div className="space-y-12">
                    <header>
                        <h1 className="font-display font-black text-5xl tracking-tighter mb-2">
                            User Profile
                        </h1>
                        <p className="font-mono-custom text-sm text-muted uppercase tracking-[3px]">
                            Customise your identity on Unify
                        </p>
                    </header>

                    <form onSubmit={handleUpdateProfile} className="space-y-10">
                        {/* Avatar Section */}
                        <div className="flex flex-col items-center sm:flex-row sm:items-end gap-8">
                            <div className="relative group">
                                <div className="w-32 h-32 rounded-3xl bg-surface2 border-2 border-border overflow-hidden flex items-center justify-center transition-all group-hover:border-accent/50 shadow-2xl">
                                    {avatarUrl ? (
                                        <Image
                                            src={avatarUrl}
                                            alt="Avatar"
                                            width={128}
                                            height={128}
                                            className="object-cover w-full h-full"
                                        />
                                    ) : (
                                        <UserIcon size={48} className="text-muted" />
                                    )}

                                    {uploading && (
                                        <div className="absolute inset-0 bg-surface/80 backdrop-blur-sm flex items-center justify-center">
                                            <Loader2 className="w-8 h-8 text-accent animate-spin" />
                                        </div>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="absolute -bottom-2 -right-2 w-10 h-10 rounded-xl bg-accent text-bg flex items-center justify-center shadow-lg hover:scale-110 active:scale-95 transition-all"
                                    disabled={uploading}
                                >
                                    <Camera size={20} />
                                </button>
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    className="hidden"
                                    accept="image/*"
                                    onChange={handleUpload}
                                />
                            </div>

                            <div className="flex-1 space-y-2 text-center sm:text-left">
                                <h3 className="font-display font-bold text-xl">Profile Picture</h3>
                                <p className="text-muted text-sm leading-relaxed max-w-xs">
                                    Upload a custom pfp. Recommended size is 256x256px.
                                </p>
                            </div>
                        </div>

                        {/* Info Section */}
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <label className="font-mono-custom text-[10px] uppercase tracking-[3px] text-muted ml-1">
                                    Display Name
                                </label>
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    placeholder="Enter your name"
                                    className="w-full bg-surface2 border border-border rounded-2xl px-6 py-4 font-display font-semibold transition-all focus:border-accent/50 focus:ring-4 focus:ring-accent/5 outline-none placeholder:text-muted/30"
                                    required
                                />
                            </div>

                            <div className="space-y-2 opacity-50">
                                <label className="font-mono-custom text-[10px] uppercase tracking-[3px] text-muted ml-1">
                                    Email Address
                                </label>
                                <div className="w-full bg-surface/50 border border-border rounded-2xl px-6 py-4 font-mono-custom text-sm text-muted cursor-not-allowed">
                                    {user.email}
                                </div>
                                <p className="text-[9px] text-muted/60 ml-1">Email cannot be changed.</p>
                            </div>
                        </div>

                        {/* Save Button */}
                        <button
                            type="submit"
                            disabled={updating || uploading}
                            className="w-full sm:w-auto px-10 py-4 bg-white text-bg font-display font-bold text-lg rounded-2xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:grayscale flex items-center justify-center gap-3 group"
                        >
                            {updating ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                <Save size={20} className="group-hover:rotate-12 transition-transform" />
                            )}
                            Save Changes
                        </button>
                    </form>
                </div>
            </main>
        </div>
    )
}
