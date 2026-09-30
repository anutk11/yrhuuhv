import { motion } from "framer-motion";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface SurveyResultsProps {
  question: string;
  options: string[];
  votes: number[];
  chartType?: "pie" | "bar";
}

const CHART_COLORS = [
  "hsl(0, 80%, 55%)",
  "hsl(220, 85%, 55%)",
  "hsl(150, 75%, 45%)",
  "hsl(30, 90%, 55%)",
];

const SurveyResults = ({ question, options, votes, chartType = "bar" }: SurveyResultsProps) => {
  const total = votes.reduce((a, b) => a + b, 0);
  const data = options.map((name, i) => ({
    name,
    value: votes[i],
    percent: total > 0 ? Math.round((votes[i] / total) * 100) : 0,
  }));

  return (
    <motion.div
      className="w-full max-w-2xl"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
    >
      <div className="gradient-card border border-border rounded-2xl p-6 md:p-8">
        <h3 className="text-xl font-display font-bold text-foreground text-center mb-2">
          תוצאות הסקר
        </h3>
        <p className="text-muted-foreground text-center text-sm mb-6">{question}</p>

        {chartType === "pie" ? (
          <div className="flex flex-col items-center">
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  innerRadius={50}
                  dataKey="value"
                  stroke="none"
                  animationDuration={800}
                >
                  {data.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "hsl(220, 18%, 10%)",
                    border: "1px solid hsl(220, 15%, 18%)",
                    borderRadius: "8px",
                    color: "hsl(200, 20%, 95%)",
                    fontFamily: "Space Grotesk",
                  }}
                  formatter={(value: number, name: string) => [`${value} (${total > 0 ? Math.round((value / total) * 100) : 0}%)`, name]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-3 justify-center mt-4">
              {data.map((d, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: CHART_COLORS[i] }} />
                  <span className="text-foreground">{d.name}</span>
                  <span className="text-muted-foreground">({d.percent}%)</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data} layout="vertical" margin={{ left: 0, right: 20 }}>
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={80}
                  tick={{ fill: "hsl(200, 20%, 95%)", fontSize: 13, fontFamily: "Space Grotesk" }}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(220, 18%, 10%)",
                    border: "1px solid hsl(220, 15%, 18%)",
                    borderRadius: "8px",
                    color: "hsl(200, 20%, 95%)",
                    fontFamily: "Space Grotesk",
                  }}
                  formatter={(value: number) => [`${value} תשובות (${total > 0 ? Math.round((Number(value) / total) * 100) : 0}%)`, ""]}
                />
                <Bar dataKey="value" radius={[0, 8, 8, 0]} animationDuration={800}>
                  {data.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 gap-2 mt-4">
              {data.map((d, i) => (
                <div key={i} className="bg-secondary rounded-lg px-3 py-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[i] }} />
                    <span className="text-foreground text-sm">{d.name}</span>
                  </div>
                  <span className="font-display text-sm text-primary">{d.percent}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground mt-4">
          סה״כ {total} תשובות
        </p>
      </div>
    </motion.div>
  );
};

export default SurveyResults;
