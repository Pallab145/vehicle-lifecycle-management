import { Badge } from '@/components/ui/badge';
import { Clock, AlertTriangle } from 'lucide-react';
import { useEffect, useState } from 'react';

export function TransferExpiryBadge({ reqDate }: { reqDate: string }) {
    const [daysLeft, setDaysLeft] = useState<number>(0);
    const [isExpired, setIsExpired] = useState(false);

    useEffect(() => {
        const calculateDays = () => {
            const reqTime = new Date(reqDate).getTime();
            const expiryTime = reqTime + 30 * 24 * 60 * 60 * 1000; // 30 days
            const now = Date.now();
            
            if (now > expiryTime) {
                setIsExpired(true);
                setDaysLeft(0);
            } else {
                setIsExpired(false);
                setDaysLeft(Math.ceil((expiryTime - now) / (1000 * 60 * 60 * 24)));
            }
        };

        calculateDays();
        const interval = setInterval(calculateDays, 1000 * 60 * 60); // Check every hour
        return () => clearInterval(interval);
    }, [reqDate]);

    if (isExpired) {
        return (
            <Badge variant="destructive" className="bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/20">
                <AlertTriangle className="mr-1 h-3 w-3" />
                Expired
            </Badge>
        );
    }

    if (daysLeft <= 3) {
        return (
            <Badge variant="outline" className="border-orange-500/50 text-orange-600 bg-orange-500/10">
                <Clock className="mr-1 h-3 w-3" />
                {daysLeft} days left
            </Badge>
        );
    }

    return (
        <Badge variant="outline" className="text-muted-foreground">
            <Clock className="mr-1 h-3 w-3" />
            {daysLeft} days left
        </Badge>
    );
}
