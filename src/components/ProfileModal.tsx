'use client'

import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { Camera, X, Loader2, Save, User as UserIcon } from 'lucide-react'
import Image from 'next/image'
import { toast } from 'sonner'

interface ProfileModalProps {
    isOpen: boolean
    onClose: () => void
}

export function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
    const { user, loading: authLoading, refreshUser } = useAuth()

    const [username, setUsername] = useState('')
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
    const [updating, setUpdating] = useState(false)
    const [uploading, setUploading] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (user && isOpen) {
            fetchProfile()
        }
    }, [user, isOpen])

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

            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, file)

            if (uploadError) throw uploadError

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

            const { error: authError } = await supabase.auth.updateUser({
                data: {
                    display_name: username,
                    avatar_url: avatarUrl
                }
            })

            if (authError) throw authError

            await refreshUser()
            toast.success('Profile updated successfully!')
            onClose()

        } catch (error: any) {
            console.error('Error updating profile:', error)
            toast.error(error.message || 'Failed to update profile')
        } finally {
            setUpdating(false)
        }
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-bg/80 backdrop-blur-sm animate-fadeIn"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative w-full max-w-lg bg-surface border border-border rounded-[2.5rem] shadow-2xl overflow-hidden animate-slideUp">
                {/* Ambient Glow */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-accent/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-accent2/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2 pointer-events-none" />

                {/* Header */}
                <div className="px-10 pt-10 pb-6 flex items-center justify-between relative z-10">
                    <div>
                        <h2 className="font-display font-black text-3xl tracking-tighter">Profile</h2>
                        <p className="font-mono-custom text-[10px] text-muted uppercase tracking-[3px]">Settings</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-surface2 rounded-full transition-colors group"
                    >
                        <X size={20} className="text-muted group-hover:text-text transition-colors" />
                    </button>
                </div>

                {/* Content */}
                <form onSubmit={handleUpdateProfile} className="px-10 pb-10 space-y-8 relative z-10">
                    {/* Avatar Upload */}
                    <div className="flex flex-col items-center gap-6">
                        <div className="relative group">
                            <div className="w-24 h-24 rounded-3xl bg-surface2 border-2 border-border overflow-hidden flex items-center justify-center transition-all group-hover:border-accent/50 shadow-xl">
                                {avatarUrl ? (
                                    <Image
                                        src={avatarUrl}
                                        alt="Avatar"
                                        width={96}
                                        height={96}
                                        className="object-cover w-full h-full"
                                    />
                                ) : (
                                    <UserIcon size={32} className="text-muted" />
                                )}

                                {uploading && (
                                    <div className="absolute inset-0 bg-surface/80 backdrop-blur-sm flex items-center justify-center">
                                        <Loader2 className="w-6 h-6 text-accent animate-spin" />
                                    </div>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="absolute -bottom-1 -right-1 w-8 h-8 rounded-lg bg-accent text-bg flex items-center justify-center shadow-lg hover:scale-110 active:scale-95 transition-all"
                                disabled={uploading}
                            >
                                <Camera size={16} />
                            </button>
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                accept="image/*"
                                onChange={handleUpload}
                            />
                        </div>
                    </div>

                    <div className="space-y-5">
                        <div className="space-y-2">
                            <label className="font-mono-custom text-[9px] uppercase tracking-[3px] text-muted ml-1">
                                Display Name
                            </label>
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="Your name"
                                className="w-full bg-surface2 border border-border rounded-2xl px-5 py-3.5 font-display font-semibold transition-all focus:border-accent/50 focus:ring-4 focus:ring-accent/5 outline-none placeholder:text-muted/30"
                                required
                            />
                        </div>

                        <div className="space-y-1.5 grayscale opacity-50">
                            <label className="font-mono-custom text-[9px] uppercase tracking-[3px] text-muted ml-1">
                                Email (Read-only)
                            </label>
                            <div className="w-full bg-surface/50 border border-border/50 rounded-2xl px-5 py-3.5 font-mono-custom text-xs text-muted/60">
                                {user?.email}
                            </div>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={updating || uploading}
                        className="w-full px-8 py-4 bg-white text-bg font-display font-bold text-lg rounded-2xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:grayscale flex items-center justify-center gap-2 group"
                    >
                        {updating ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <Save size={18} className="group-hover:rotate-12 transition-transform" />
                        )}
                        Update Identity
                    </button>
                </form>
            </div>
        </div>
    )
}
