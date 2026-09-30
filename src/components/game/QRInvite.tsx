import { QRCodeSVG } from "qrcode.react";
import { motion } from "framer-motion";

interface QRInviteProps {
  roomCode: string;
  baseUrl?: string;
}

const QRInvite = ({ roomCode, baseUrl = window.location.origin }: QRInviteProps) => {
  const joinUrl = `${baseUrl}/join?code=${roomCode}`;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center gap-3"
    >
      <div className="bg-foreground p-3 rounded-xl">
        <QRCodeSVG
          value={joinUrl}
          size={160}
          bgColor="hsl(200, 20%, 95%)"
          fgColor="hsl(220, 20%, 7%)"
          level="M"
        />
      </div>
      <p className="text-xs text-muted-foreground text-center max-w-[180px]">
        סרוק את הקוד כדי להצטרף למשחק
      </p>
    </motion.div>
  );
};

export default QRInvite;
