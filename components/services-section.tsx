import { Bike, Wrench } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface ServicesSectionProps {
  dict: {
    services: {
      title: string
      rental: { title: string; desc: string }
      repair: { title: string; desc: string }
    }
  }
}

export function ServicesSection({ dict }: ServicesSectionProps) {
  return (
    <section id="servizi" className="py-20 bg-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <h2 className="text-3xl sm:text-4xl font-bold text-center text-foreground mb-12">
          {dict.services.title}
        </h2>
        <div className="grid sm:grid-cols-2 gap-8">
          <Card className="border-border/60 hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                <Bike className="text-primary" size={24} />
              </div>
              <CardTitle className="text-xl text-foreground">
                {dict.services.rental.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground leading-relaxed">
                {dict.services.rental.desc}
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/60 hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                <Wrench className="text-primary" size={24} />
              </div>
              <CardTitle className="text-xl text-foreground">
                {dict.services.repair.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground leading-relaxed">
                {dict.services.repair.desc}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  )
}
