"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useCompanyContext } from "@/components/company-provider"
import { toast } from "@/hooks/use-toast"
import { 
  Settings, 
  Building2, 
  Save, 
  Upload,
  Image as ImageIcon,
  Mail,
  Phone,
  Globe,
  MapPin,
  Palette,
  Type,
  AlignLeft
} from "lucide-react"
import { cn } from "@/lib/utils"
import Image from "next/image"
import { ImagePreviewModal } from "@/components/image-preview-modal"

interface SettingsData {
  // Company Branding
  companyName: string
  companyColor: string
  companyLogo: string
  mainHeadline: string
  heroBackgroundImage: string
  heroTaglineAlignment: string
  // Contact Information
  websiteUrl: string
  contactEmail: string
  contactPhone: string
  address: string
  // SEO
  seo: {
    favicon: string
  }
}

export default function SettingsPage() {
  const { 
    companyName, 
    companyColor, 
    companyLogo, 
    mainHeadline,
    heroBackgroundImage,
    heroTaglineAlignment,
    updateCompanyName,
    updateCompanyColor, 
    updateCompanyLogo, 
    updateMainHeadline,
    updateHeroBackgroundImage,
    updateHeroTaglineAlignment,
    resetCompanyName,
    resetCompanyColor, 
    resetCompanyLogo, 
    resetMainHeadline,
    resetHeroBackgroundImage,
    resetHeroTaglineAlignment,
    isLoaded,
    settings: adminSettings,
    updateSettings
  } = useCompanyContext()
  
  // Initialize settings with current admin settings data
  const [settings, setSettings] = useState<SettingsData>({
    companyName: companyName,
    companyColor: companyColor,
    companyLogo: companyLogo,
    mainHeadline: mainHeadline,
    heroBackgroundImage: heroBackgroundImage,
    heroTaglineAlignment: adminSettings?.heroTaglineAlignment || 'left',
    websiteUrl: adminSettings?.websiteUrl || "",
    contactEmail: adminSettings?.contactEmail || "",
    contactPhone: adminSettings?.contactPhone || "",
    address: adminSettings?.address || "",
    seo: {
      favicon: adminSettings?.seo?.favicon || "/favicon.ico"
    }
  })

  const [isUpdating, setIsUpdating] = useState(false)
  const [isUploadingLogo, setIsUploadingLogo] = useState(false)
  const [isUploadingHeroImage, setIsUploadingHeroImage] = useState(false)
  const [isImagePreviewOpen, setIsImagePreviewOpen] = useState(false)

  // Update local settings when admin settings are loaded from database
  useEffect(() => {
    if (isLoaded && adminSettings) {
      setSettings(prev => ({
        ...prev,
        companyName: companyName,
        companyColor: companyColor,
        companyLogo: companyLogo,
        mainHeadline: mainHeadline,
        heroBackgroundImage: heroBackgroundImage,
        websiteUrl: adminSettings.websiteUrl || prev.websiteUrl,
        contactEmail: adminSettings.contactEmail || prev.contactEmail,
        contactPhone: adminSettings.contactPhone || prev.contactPhone,
        address: adminSettings.address || prev.address,
        seo: {
          favicon: adminSettings.seo?.favicon || prev.seo.favicon
        }
      }))
    }
  }, [isLoaded, adminSettings, companyName, companyColor, companyLogo, mainHeadline, heroBackgroundImage])

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon']
    if (!allowedTypes.includes(file.type)) {
      toast({ title: "Error", description: "Please upload a valid image file (PNG, JPG, GIF, SVG, or ICO)", variant: "destructive" })
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Error", description: "File size must be less than 5MB", variant: "destructive" })
      return
    }

    setIsUploadingLogo(true)
    try {
      const reader = new FileReader()
      reader.onload = async (e) => {
        const dataUrl = e.target?.result as string
        const success = await updateCompanyLogo(dataUrl)
        if (success) {
          setSettings(prev => ({ ...prev, companyLogo: dataUrl }))
          toast({ title: "Success", description: "Company logo updated successfully" })
        } else {
          toast({ title: "Error", description: "Failed to update company logo", variant: "destructive" })
        }
        setIsUploadingLogo(false)
      }
      reader.onerror = () => {
        toast({ title: "Error", description: "Failed to read the uploaded file", variant: "destructive" })
        setIsUploadingLogo(false)
      }
      reader.readAsDataURL(file)
    } catch (error) {
      toast({ title: "Error", description: "An error occurred while uploading the logo", variant: "destructive" })
      setIsUploadingLogo(false)
    }
  }

  const handleHeroImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      toast({ title: "Error", description: "Please upload a valid image file (PNG, JPG, GIF, or WebP)", variant: "destructive" })
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "Error", description: "File size must be less than 10MB", variant: "destructive" })
      return
    }

    setIsUploadingHeroImage(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/admin/hero-upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      })

      const result = await response.json()

      if (response.ok && result.success) {
        const success = await updateHeroBackgroundImage(result.url)
        if (success) {
          setSettings(prev => ({ ...prev, heroBackgroundImage: result.url }))
          toast({ title: "Success", description: "Hero background image uploaded and updated successfully" })
        } else {
          toast({ title: "Error", description: "Failed to update hero background image setting", variant: "destructive" })
        }
      } else {
        toast({ title: "Error", description: result.error || "Failed to upload hero image", variant: "destructive" })
      }
    } catch (error) {
      toast({ title: "Error", description: "An error occurred while uploading the hero image", variant: "destructive" })
    } finally {
      setIsUploadingHeroImage(false)
    }
  }

  const handleSaveSettings = async () => {
    setIsUpdating(true)
    try {
      const safeSettings = {
        companyName: settings.companyName,
        companyColor: settings.companyColor,
        companyLogo: settings.companyLogo,
        mainHeadline: settings.mainHeadline,
        heroBackgroundImage: settings.heroBackgroundImage,
        heroTaglineAlignment: settings.heroTaglineAlignment,
        websiteUrl: settings.websiteUrl,
        contactEmail: settings.contactEmail,
        contactPhone: settings.contactPhone,
        address: settings.address,
        seo: settings.seo
      }
      
      const success = await updateSettings(safeSettings)
      if (success) {
        toast({ title: "Success", description: "All settings saved successfully" })
      } else {
        toast({ title: "Warning", description: "Some settings may not have saved. Please try again.", variant: "destructive" })
      }
    } catch (error) {
      toast({ title: "Error", description: "An unexpected error occurred while saving settings", variant: "destructive" })
    } finally {
      setIsUpdating(false)
    }
  }

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen" suppressHydrationWarning>
        <div className="text-center" suppressHydrationWarning>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto" suppressHydrationWarning></div>
          <p className="mt-2 text-sm text-gray-600" suppressHydrationWarning>Loading settings...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                <Settings className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                Settings
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                Manage your company branding and contact information
              </p>
            </div>
            <Button 
              onClick={handleSaveSettings} 
              disabled={isUpdating}
              size="lg"
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Save className="h-5 w-5" />
              <span>{isUpdating ? "Saving..." : "Save All Settings"}</span>
            </Button>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Left Column - Company Branding */}
          <div className="xl:col-span-2 space-y-6">
            {/* Company Branding Card */}
            <Card className="shadow-sm border-gray-200 dark:border-gray-700">
              <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-700 border-b border-gray-200 dark:border-gray-700">
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Building2 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  Company Branding
                </CardTitle>
                <CardDescription className="text-sm mt-1">
                  Configure your company's visual identity and branding elements
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                {/* Company Name & Color Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="company-name" className="flex items-center gap-2 text-sm font-semibold">
                      <Type className="h-4 w-4" />
                      Company Name
                    </Label>
                    <Input
                      id="company-name"
                      value={settings.companyName}
                      onChange={(e) => setSettings(prev => ({ ...prev, companyName: e.target.value }))}
                      placeholder="Enter company name"
                      className="h-11"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="company-color" className="flex items-center gap-2 text-sm font-semibold">
                      <Palette className="h-4 w-4" />
                      Brand Color
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="company-color"
                        value={settings.companyColor}
                        onChange={(e) => setSettings(prev => ({ ...prev, companyColor: e.target.value }))}
                        placeholder="#3B82F6"
                        className="h-11 flex-1"
                      />
                      <div 
                        className="w-14 h-11 rounded-md border-2 border-gray-300 dark:border-gray-600 flex-shrink-0 shadow-sm"
                        style={{ backgroundColor: settings.companyColor }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Hex color code</p>
                  </div>
                </div>

                <Separator />

                {/* Logo & Favicon Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <Label className="flex items-center gap-2 text-sm font-semibold">
                      <ImageIcon className="h-4 w-4" />
                      Company Logo
                    </Label>
                    <div className="flex items-center gap-4">
                      <div className="relative w-20 h-20 border-2 border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800 flex-shrink-0">
                        <Image
                          src={settings.companyLogo}
                          alt="Company Logo"
                          fill
                          className="object-contain p-2"
                        />
                      </div>
                      <div className="flex-1">
                        <input
                          type="file"
                          id="company-logo"
                          accept=".png,.jpg,.jpeg,.gif,.svg,.ico"
                          onChange={handleLogoUpload}
                          className="hidden"
                          disabled={isUploadingLogo}
                        />
                        <Label
                          htmlFor="company-logo"
                          className={cn(
                            "cursor-pointer inline-flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all",
                            isUploadingLogo && "opacity-50 cursor-not-allowed"
                          )}
                        >
                          <Upload className="h-4 w-4" />
                          <span className="text-sm font-medium">
                            {isUploadingLogo ? "Uploading..." : "Upload Logo"}
                          </span>
                        </Label>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                          PNG, JPG, GIF, SVG, ICO (max 5MB)
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label className="flex items-center gap-2 text-sm font-semibold">
                      <Globe className="h-4 w-4" />
                      Website Favicon
                    </Label>
                    <div className="flex items-center gap-4">
                      <div className="relative w-12 h-12 border-2 border-gray-200 dark:border-gray-700 rounded-md overflow-hidden bg-white dark:bg-gray-800 flex-shrink-0">
                        {settings.seo.favicon && (
                          <Image
                            src={settings.seo.favicon}
                            alt="Favicon"
                            fill
                            className="object-contain p-1"
                            unoptimized
                          />
                        )}
                      </div>
                      <div className="flex-1">
                        <Input
                          id="favicon"
                          value={settings.seo.favicon}
                          onChange={(e) => setSettings(prev => ({ 
                            ...prev, 
                            seo: { ...prev.seo, favicon: e.target.value } 
                          }))}
                          placeholder="/favicon.ico or full URL"
                          className="h-11"
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                          Path or full URL
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Main Headline */}
                <div className="space-y-3">
                  <Label htmlFor="main-headline" className="flex items-center gap-2 text-sm font-semibold">
                    <Type className="h-4 w-4" />
                    Main Headline
                  </Label>
                  <Textarea
                    id="main-headline"
                    value={settings.mainHeadline}
                    onChange={(e) => setSettings(prev => ({ ...prev, mainHeadline: e.target.value }))}
                    placeholder="The leading B2B ecommerce platform for global trade"
                    rows={3}
                    className="resize-none"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Displayed on the landing page hero section
                  </p>
                </div>

                <Separator />

                {/* Hero Section Settings */}
                <div className="space-y-4">
                  <Label className="text-sm font-semibold block">Hero Section</Label>
                  
                  {/* Hero Background Image */}
                  <div className="space-y-3">
                    <Label htmlFor="hero-background-image" className="text-sm font-medium">
                      Background Image
                    </Label>
                    <div className="flex items-start gap-4">
                      <div 
                        className="relative w-32 h-20 border-2 border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 flex-shrink-0 cursor-pointer hover:border-blue-500 dark:hover:border-blue-400 transition-colors group"
                        onClick={() => {
                          if (settings.heroBackgroundImage) {
                            setIsImagePreviewOpen(true)
                          }
                        }}
                      >
                        {settings.heroBackgroundImage ? (
                          <Image
                            src={settings.heroBackgroundImage}
                            alt="Hero Background"
                            fill
                            className="object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
                            <ImageIcon className="h-6 w-6 mb-1" />
                            <span className="text-xs">No Image</span>
                          </div>
                        )}
                        {settings.heroBackgroundImage && (
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                            <span className="text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                              Click to preview
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 space-y-2">
                        <input
                          type="file"
                          id="hero-background-image"
                          accept=".png,.jpg,.jpeg,.gif,.webp"
                          onChange={handleHeroImageUpload}
                          className="hidden"
                          disabled={isUploadingHeroImage}
                        />
                        <Label
                          htmlFor="hero-background-image"
                          className={cn(
                            "cursor-pointer inline-flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all",
                            isUploadingHeroImage && "opacity-50 cursor-not-allowed"
                          )}
                        >
                          <Upload className="h-4 w-4" />
                          <span className="text-sm font-medium">
                            {isUploadingHeroImage ? "Uploading..." : "Upload Hero Image"}
                          </span>
                        </Label>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Recommended: 1920x600px. PNG, JPG, GIF, WebP (max 10MB)
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Hero Tagline Alignment */}
                  <div className="space-y-2">
                    <Label htmlFor="hero-tagline-alignment" className="flex items-center gap-2 text-sm font-medium">
                      <AlignLeft className="h-4 w-4" />
                      Content Alignment
                    </Label>
                    <Select 
                      value={settings.heroTaglineAlignment} 
                      onValueChange={(value) => setSettings(prev => ({ ...prev, heroTaglineAlignment: value }))}
                    >
                      <SelectTrigger className="h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="left">Left</SelectItem>
                        <SelectItem value="center">Center</SelectItem>
                        <SelectItem value="right">Right</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      How the hero section content should be aligned
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Contact Information */}
          <div className="space-y-6">
            <Card className="shadow-sm border-gray-200 dark:border-gray-700">
              <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-gray-800 dark:to-gray-700 border-b border-gray-200 dark:border-gray-700">
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Mail className="h-6 w-6 text-green-600 dark:text-green-400" />
                  Contact Information
                </CardTitle>
                <CardDescription className="text-sm mt-1">
                  Update your company's contact details displayed in the footer
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="website-url" className="flex items-center gap-2 text-sm font-semibold">
                    <Globe className="h-4 w-4" />
                    Website URL
                  </Label>
                  <Input
                    id="website-url"
                    value={settings.websiteUrl}
                    onChange={(e) => setSettings(prev => ({ ...prev, websiteUrl: e.target.value }))}
                    placeholder="https://your-website.com"
                    className="h-11"
                  />
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label htmlFor="contact-email" className="flex items-center gap-2 text-sm font-semibold">
                    <Mail className="h-4 w-4" />
                    Contact Email
                  </Label>
                  <Input
                    id="contact-email"
                    type="email"
                    value={settings.contactEmail}
                    onChange={(e) => setSettings(prev => ({ ...prev, contactEmail: e.target.value }))}
                    placeholder="contact@company.com"
                    className="h-11"
                  />
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label htmlFor="contact-phone" className="flex items-center gap-2 text-sm font-semibold">
                    <Phone className="h-4 w-4" />
                    Contact Phone
                  </Label>
                  <Input
                    id="contact-phone"
                    value={settings.contactPhone}
                    onChange={(e) => setSettings(prev => ({ ...prev, contactPhone: e.target.value }))}
                    placeholder="+255 123 456 789"
                    className="h-11"
                  />
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label htmlFor="address" className="flex items-center gap-2 text-sm font-semibold">
                    <MapPin className="h-4 w-4" />
                    Address
                  </Label>
                  <Textarea
                    id="address"
                    value={settings.address}
                    onChange={(e) => setSettings(prev => ({ ...prev, address: e.target.value }))}
                    placeholder="Enter company address"
                    rows={4}
                    className="resize-none"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Info Card */}
            <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
              <CardContent className="p-4">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  <strong>Note:</strong> These contact details are displayed in the footer of your website. Make sure to keep them up to date.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Image Preview Modal */}
      <ImagePreviewModal
        isOpen={isImagePreviewOpen}
        onClose={() => setIsImagePreviewOpen(false)}
        imageUrl={settings.heroBackgroundImage}
        imageAlt="Hero Background Preview"
        title="Hero Background Image Preview"
      />
    </div>
  )
}
