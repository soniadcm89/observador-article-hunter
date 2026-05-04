import React, { useState, useEffect } from "react";
import { 
  Search, 
  Download, 
  Calendar as CalendarIcon, 
  Loader2, 
  Newspaper, 
  ExternalLink,
  Target,
  Database,
  Info
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { format, subDays, startOfMonth, subMonths, parse, isValid } from "date-fns";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "motion/react";
import ExcelJS from "exceljs";

interface Article {
  url: string;
  title: string;
  date: string;
  source: string;
}

interface SearchStats {
  candidates: number;
  matched: number;
}

export default function App() {
  const [queryInput, setQueryInput] = useState("");
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [maxScrapes, setMaxScrapes] = useState(100);

  const [startDateInput, setStartDateInput] = useState(startDate ? format(startDate, "yyyy-MM-dd") : "");
  const [endDateInput, setEndDateInput] = useState(endDate ? format(endDate, "yyyy-MM-dd") : "");

  useEffect(() => {
    if (startDate) setStartDateInput(format(startDate, "yyyy-MM-dd"));
    else setStartDateInput("");
  }, [startDate]);

  useEffect(() => {
    if (endDate) setEndDateInput(format(endDate, "yyyy-MM-dd"));
    else setEndDateInput("");
  }, [endDate]);

  const handleDateInputChange = (val: string, setter: (d: Date | undefined) => void) => {
    if (!val) {
      setter(undefined);
      return;
    }
    // Try YYYY-MM-DD
    const formats = ["yyyy-MM-dd", "dd/MM/yyyy", "MM/dd/yyyy"];
    for (const fmt of formats) {
      const parsed = parse(val, fmt, new Date());
      if (isValid(parsed) && val.length >= 8) {
        setter(parsed);
        return;
      }
    }
  };
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<Article[]>([]);
  const [stats, setStats] = useState<SearchStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const setQuickRange = (days: number | "this_month" | "last_3_months") => {
    const end = new Date();
    setEndDate(end);
    let start = new Date();
    if (typeof days === "number") {
      start = subDays(end, days);
    } else if (days === "this_month") {
      start = startOfMonth(end);
    } else if (days === "last_3_months") {
      start = subMonths(end, 3);
    }
    setStartDate(start);
  };

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    if (!queryInput.trim()) {
      setError("Please enter a search query.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setHasSearched(true);
    setResults([]);
    setStats(null);

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: queryInput,
          startDate: startDate ? format(startDate, "yyyy-MM-dd") : undefined,
          endDate: endDate ? format(endDate, "yyyy-MM-dd") : undefined,
          maxScrapes
        }),
      });

      if (!response.ok) {
        throw new Error("Search failed. The server might be busy or the site is blocking requests.");
      }

      const data = await response.json();
      setResults(data.articles);
      setStats(data.stats);
    } catch (err: any) {
      console.error("Search Error:", err);
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = async () => {
    if (results.length === 0) return;

    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Articles Found");

      worksheet.columns = [
        { header: "Title", key: "title", width: 60 },
        { header: "Date", key: "date", width: 20 },
        { header: "URL", key: "url", width: 80 },
        { header: "Source", key: "source", width: 15 },
      ];

      worksheet.getRow(1).font = { bold: true };

      results.forEach(article => {
        worksheet.addRow({
          title: article.title,
          date: article.date ? format(new Date(article.date), "yyyy-MM-dd") : "N/A",
          url: article.url,
          source: article.source,
        });
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `articles-export-${format(new Date(), "yyyyMMdd-HHmm")}.xlsx`;
      link.click();
    } catch (err) {
      console.error("Export failed", err);
      setError("Failed to export Excel file.");
    }
  };

  return (
    <div className="min-h-screen bg-[#fcfcfd] text-slate-900 font-sans selection:bg-blue-100">
      <div className="max-w-6xl mx-auto px-6 py-12">
        {/* Header Section */}
        <header className="mb-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
              <Newspaper className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Observador Article Hunter</h1>
              <p className="text-slate-500 font-medium">Precision scraper for Observador Archives</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="bg-white border-slate-200 hover:bg-slate-50 font-semibold"
              onClick={handleExport}
              disabled={results.length === 0}
            >
              <Download className="w-4 h-4 mr-2" />
              Export Excel
            </Button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Search & Filters */}
          <div className="lg:col-span-12">
            <Card className="border-slate-200/60 shadow-sm overflow-hidden bg-white">
              <CardHeader className="bg-slate-50/50 border-b border-slate-100">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Target className="w-4 h-4 text-blue-500" />
                  Search Configuration
                </CardTitle>
                <CardDescription className="flex flex-col gap-1">
                  <span>Enter keywords or complex logic to scan sitemaps and discovery engines.</span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-100/80 px-2 py-0.5 rounded w-fit">
                    Use quotes for exact phrases, AND/OR/NOT for boolean logic.
                  </span>
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <form onSubmit={handleSearch} className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="query" className="text-xs font-bold text-slate-500 uppercase">Search Query</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input
                        id="query"
                        className="pl-10 h-12 bg-slate-50/50 border-slate-200 focus:ring-blue-500 rounded-xl"
                        placeholder='e.g. "aulas de cidadania" OR política AND NOT desporto'
                        value={queryInput}
                        onChange={(e) => setQueryInput(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-bold text-slate-500 uppercase block">Time Period</Label>
                        <div className="flex gap-1">
                          {[
                            { label: "7d", val: 7 },
                            { label: "30d", val: 30 },
                            { label: "Month", val: "this_month" },
                            { label: "3m", val: "last_3_months" }
                          ].map(p => (
                            <button
                              key={p.label}
                              type="button"
                              onClick={() => setQuickRange(p.val as any)}
                              className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-slate-200 hover:bg-slate-100 transition-colors text-slate-600 uppercase"
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <Popover>
                            <PopoverTrigger render={
                              <div className="relative">
                                <Input
                                  value={startDateInput}
                                  onChange={(e) => {
                                    setStartDateInput(e.target.value);
                                    handleDateInputChange(e.target.value, setStartDate);
                                  }}
                                  placeholder="YYYY-MM-DD"
                                  className="h-11 rounded-xl pl-9 bg-slate-50/50"
                                />
                                <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                              </div>
                            } />
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar 
                                mode="single" 
                                selected={startDate} 
                                onSelect={setStartDate} 
                                initialFocus 
                                captionLayout="dropdown"
                                fromYear={2000}
                                toYear={new Date().getFullYear()}
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                        <span className="text-slate-300">→</span>
                        <div className="relative flex-1">
                          <Popover>
                            <PopoverTrigger render={
                              <div className="relative">
                                <Input
                                  value={endDateInput}
                                  onChange={(e) => {
                                    setEndDateInput(e.target.value);
                                    handleDateInputChange(e.target.value, setEndDate);
                                  }}
                                  placeholder="YYYY-MM-DD"
                                  className="h-11 rounded-xl pl-9 bg-slate-50/50"
                                />
                                <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                              </div>
                            } />
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar 
                                mode="single" 
                                selected={endDate} 
                                onSelect={setEndDate} 
                                initialFocus 
                                captionLayout="dropdown"
                                fromYear={2000}
                                toYear={new Date().getFullYear()}
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3 md:col-span-1">
                      <Label htmlFor="maxScrapes" className="text-xs font-bold text-slate-500 uppercase">Search Depth</Label>
                      <div className="flex items-center gap-4 h-11">
                        <input 
                          type="range" 
                          min="10" 
                          max="200" 
                          step="10"
                          className="flex-1 accent-blue-600"
                          value={maxScrapes}
                          onChange={(e) => setMaxScrapes(Number(e.target.value))}
                        />
                        <Badge variant="secondary" className="h-7 min-w-[3rem] justify-center bg-blue-50 text-blue-600 hover:bg-blue-50">
                          {maxScrapes}
                        </Badge>
                      </div>
                    </div>

                    <div className="flex items-end">
                      <Button 
                        type="submit" 
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white h-11 rounded-xl shadow-md shadow-blue-100 transition-all active:scale-95"
                        disabled={isLoading}
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Scouring Archives...
                          </>
                        ) : (
                          "Start Discovery"
                        )}
                      </Button>
                    </div>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* Results Area */}
          <div className="lg:col-span-12">
            <AnimatePresence mode="wait">
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mb-6 p-4 bg-red-50 text-red-700 rounded-xl border border-red-100 text-sm flex items-start gap-3"
                >
                  <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center text-white shrink-0">!</div>
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            <Card className="border-slate-200/60 shadow-sm bg-white min-h-[400px] flex flex-col">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b border-slate-50">
                <div>
                  <CardTitle className="text-lg">Results</CardTitle>
                  {stats && (
                    <CardDescription className="flex items-center gap-2 mt-1">
                      <Database className="w-3.5 h-3.5" />
                      Analyzed {stats.candidates} candidates · Found {stats.matched} matches
                    </CardDescription>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0 flex-1 flex flex-col">
                {!hasSearched ? (
                  <div className="flex-1 flex flex-col items-center justify-center py-20 text-slate-400">
                    <Search className="w-12 h-12 mb-4 opacity-20" />
                    <p className="text-sm font-medium">Use the hunt configuration above to discover articles.</p>
                  </div>
                ) : isLoading ? (
                  <div className="flex-1 flex flex-col items-center justify-center py-20">
                    <div className="relative">
                      <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Target className="w-5 h-5 text-blue-500" />
                      </div>
                    </div>
                    <p className="mt-6 text-sm font-bold text-slate-500 animate-pulse uppercase tracking-widest">Running Advanced Discovery...</p>
                    <p className="text-xs text-slate-400 mt-2 italic">Scanning Observador sitemaps & DuckDuckGo matching engine</p>
                  </div>
                ) : results.length > 0 ? (
                  <div className="flex flex-col h-full">
                    <div className="px-6 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/30">
                      <div className="flex items-center gap-4">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Archive Report</span>
                        <div className="h-3 w-[1px] bg-slate-200" />
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-blue-600">{results.length}</span>
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Matches Found</span>
                        </div>
                      </div>
                      {stats && (
                        <div className="flex items-center gap-4 text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                          <span>Scanned {stats.candidates} Candidates</span>
                        </div>
                      )}
                    </div>
                    <div className="overflow-x-auto">
                      <Table>
                      <TableHeader className="bg-slate-50/50">
                        <TableRow className="border-none">
                          <TableHead className="w-[60%] pl-6">Headline & Source</TableHead>
                          <TableHead>Archive Date</TableHead>
                          <TableHead className="pr-6 text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {results.map((article, idx) => (
                          <motion.tr
                            key={article.url}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.03 }}
                            className="group hover:bg-slate-50/50 transition-colors border-slate-50"
                          >
                            <TableCell className="pl-6 py-5">
                              <div className="flex flex-col gap-1">
                                <span className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors leading-tight">
                                  {article.title}
                                </span>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-[9px] uppercase font-bold py-0 h-4 border-emerald-100 bg-emerald-50/50 text-emerald-600">
                                    {article.source}
                                  </Badge>
                                  <span className="text-[10px] text-slate-400 truncate max-w-sm">
                                    {article.url}
                                  </span>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2 text-slate-500">
                                <CalendarIcon className="w-3.5 h-3.5" />
                                <span className="font-mono text-[11px] font-medium tracking-tight">
                                  {article.date ? format(new Date(article.date), "yyyy-MM-dd") : "Unknown"}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="pr-6 text-right">
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-9 px-3 group-hover:bg-blue-600 group-hover:text-white rounded-xl transition-all font-semibold gap-2"
                                render={
                                  <a href={article.url} target="_blank" rel="noopener noreferrer">
                                    View Article
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </a>
                                }
                              />
                            </TableCell>
                          </motion.tr>
                        ))}
                      </TableBody>
                    </Table>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center py-20 text-slate-400">
                    <Search className="w-12 h-12 mb-4 opacity-20" />
                    <p className="text-sm font-medium">Zero matches found. Try adjusting keywords or widening the period.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <footer className="mt-20 py-8 border-t border-slate-100 bg-white">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          <div className="flex items-center gap-6">
            <span>© 2026 Observador Article Hunter</span>
            <span className="hidden md:inline">·</span>
            <span>Educational Research Toolkit</span>
          </div>
          <div className="flex items-center gap-6">
            <span className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Sitemap Sync Active
            </span>
            <span className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              Observador Engine Live
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
