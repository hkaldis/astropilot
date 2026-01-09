import { Fragment } from "react";
import { Link } from "wouter";
import { Home } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export interface BreadcrumbItemType {
  label: string;
  href?: string;
}

interface PageBreadcrumbProps {
  items: BreadcrumbItemType[];
  showHome?: boolean;
}

export function PageBreadcrumb({ items, showHome = true }: PageBreadcrumbProps) {
  if (items.length === 0) return null;

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {showHome && (
          <Fragment>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/" data-testid="breadcrumb-home">
                  <Home className="w-4 h-4" />
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
          </Fragment>
        )}
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          
          return (
            <Fragment key={index}>
              <BreadcrumbItem>
                {!isLast && item.href ? (
                  <BreadcrumbLink asChild>
                    <Link href={item.href} data-testid={`breadcrumb-${index}`}>
                      {item.label}
                    </Link>
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage data-testid={`breadcrumb-current`}>
                    {item.label}
                  </BreadcrumbPage>
                )}
              </BreadcrumbItem>
              {!isLast && <BreadcrumbSeparator />}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
