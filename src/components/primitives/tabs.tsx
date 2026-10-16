import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';

import { cn } from '@/lib/utils';

const Tabs = TabsPrimitive.Root;

// AI dev note: duas aparências de abas.
// - "segmented" (padrão): controle segmentado, para sub-abas e filtros.
// - "line": abas sublinhadas, para o nível principal de uma página que tem
//   sub-abas embaixo (ex.: Configurações). Antes os 2-3 níveis eram idênticos
//   e um parecia continuação do outro.
// Em telas estreitas a lista rola na horizontal em vez de quebrar linha.
type TabsVariant = 'segmented' | 'line';
const TabsVariantContext = React.createContext<TabsVariant>('segmented');

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & {
    variant?: TabsVariant;
  }
>(({ className, variant = 'segmented', ...props }, ref) => (
  <TabsVariantContext.Provider value={variant}>
    <TabsPrimitive.List
      ref={ref}
      className={cn(
        'max-w-full items-center overflow-x-auto scrollbar-none text-muted-foreground',
        variant === 'segmented' &&
          'inline-flex h-10 justify-start rounded-lg border border-border/60 bg-muted p-1',
        variant === 'line' &&
          'flex h-auto w-full justify-start gap-1 border-b border-border',
        className
      )}
      {...props}
    />
  </TabsVariantContext.Provider>
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => {
  const variant = React.useContext(TabsVariantContext);
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap text-sm font-medium ring-offset-background transition-[color,background-color,box-shadow,border-color] duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
        variant === 'segmented' &&
          'min-h-8 rounded-md px-3 py-1 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-[0_1px_2px_hsl(var(--roxo-titulo)/0.08),0_0_0_1px_hsl(var(--border))]',
        variant === 'line' &&
          '-mb-px min-h-10 rounded-t-md border-b-2 border-transparent px-3 py-2 hover:border-border data-[state=active]:border-[hsl(var(--azul-respira-ink))] data-[state=active]:font-semibold data-[state=active]:text-roxo-titulo dark:data-[state=active]:border-primary dark:data-[state=active]:text-foreground',
        className
      )}
      {...props}
    />
  );
});
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      'mt-4 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      className
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
