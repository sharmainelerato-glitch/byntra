
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ChangeEvent
} from "react";
import {
  Home, Compass, Plus, Route, UserRound, Search,
  Heart, MessageCircle, Bookmark, Send, ArrowLeft,
  MoreHorizontal, Globe2, Users, Clapperboard,
  BookOpen, Music, Palette, MapPin, ImagePlus,
  LogOut, Settings, Video, PhoneOff, Mic, MicOff,
  VideoOff, Sparkles, ChevronRight, Check, Trash2,
  X, Camera, RefreshCw, Utensils, Plane, Shirt,
  CalendarDays, Menu
} from "lucide-react";
import {
  type User, type Post, type Comment, type Journey,
  request, post, put, remove, upload, media,
  getToken, setToken, clearToken
} from "./api";
import FloatingByntraAI from "./components/FloatingByntraAI";
import AIResponse from "./AIResponse";
import "./qloo.css";

import { client } from "./lib/appwrite";




type Page =
  | "home" | "explore" | "create" | "profile"
  | "explorers" | "post" | "bridges" | "journeys"
  | "together" | "messages" | "assistant" | "settings";

type Conversation = { id: number; other: User };
type Message = {
  id: number;
  sender_id: number;
  body: string;
  created_at: string;
};
type Bridge = { post: Post; shared_topics: string[]; shared_categories?: string[] };
type ExploreMoreResult = {
  source_post: Post;
  related_posts: Bridge[];
  discovery_queries: { category: string; query: string }[];
  method: string;
  external_results_verified: boolean;
};
type JourneyInvitation = {
  id: number;
  title: string;
  focus: string;
  style: string;
  status: "pending";
  inviter: User;
  created_at: string;
};
type JourneyActivity = {
  id: string;
  text: string;
  author_id: number | null;
  created_at?: string;
  author: Pick<User, "id" | "username" | "display_name" | "avatar"> | null;
  votes?: Record<string, "yes" | "no">;
};
type JourneyActivityResponse = {
  journey_id: number;
  status: string;
  activities: JourneyActivity[];
  total: number;
};

type PublicDiscovery = {
  id: string;
  title: string;
  image?: string | null;
  url?: string | null;
  source: string;
};
type PublicDiscoveryResponse = {
  results: PublicDiscovery[];
  source: string;
  query: string;
  personalized: boolean;
};
type QlooEntity = {
  id: string;
  name: string;
  type?: string;
  image?: string | null;
  properties?: Record<string, unknown>;
  affinity?: number | null;
  source: "qloo";
};
type QlooSearchResponse = { results: QlooEntity[]; source: string };
type QlooRecommendations = { results: QlooEntity[]; source: string; count: number };
type QlooSaved = {
  id: number;
  entity_id: string;
  name: string;
  category: string;
  image?: string | null;
};
const qlooCategories: Record<string, string> = {
  "Film & TV": "movies",
  "Music": "music",
  "Dining": "dining",
  "Travel": "travel",
  "Fashion": "fashion",
  "Books": "books",
  "Gaming": "games"
};
const qlooTargets = [
  { label: "Films", value: "movies" },
  { label: "TV & Series", value: "series" },
  { label: "Music", value: "music" },
  { label: "Dining & Food", value: "dining" },
  { label: "Travel", value: "travel" },
  { label: "Fashion", value: "fashion" },
  { label: "Books", value: "books" },
  { label: "Places", value: "places" },
  { label: "Games", value: "games" },
  { label: "People", value: "people" },
  { label: "Podcasts", value: "podcasts" }
];


const categories = [
  "Film & TV", "Music", "Dining", "Travel",
  "Fashion", "Books", "Art", "Events",
  "Photography", "Culture", "Wellness",
  "Gaming", "Technology", "Nature", "Theatre",
  "Architecture", "History", "Design", "Other"
];

const categoryIcons = [
  Clapperboard, Music, Utensils, Plane, Shirt, BookOpen,
  Palette, CalendarDays, Camera, Globe2, Heart, Compass,
  Sparkles, Globe2, Clapperboard, MapPin, BookOpen, Palette, Compass
];

const navItems = [
  { id: "home", label: "Home", icon: Home },
  { id: "explore", label: "Explore", icon: Search },
  { id: "create", label: "Post", icon: Plus },
  { id: "journeys", label: "Journeys", icon: Route },
  { id: "profile", label: "Profile", icon: UserRound }
] as const;

function Avatar({
  user,
  size = 44
}: {
  user?: User | null;
  size?: number;
}) {
  return user?.avatar ? (
    <img
      className="avatar"
      src={media(user.avatar)}
      alt={user.display_name}
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      className="avatar avatar-empty"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38
      }}
    >
      {user?.display_name?.charAt(0).toUpperCase() || "B"}
    </span>
  );
}

function Empty({
  title,
  description,
  children
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <Sparkles size={25} />
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}

function PostCard({
  item,
  onProfile,
  onOpen,
  onLike,
  onSave,
  onBridge
}: {
  item: Post;
  onProfile: () => void;
  onOpen: () => void;
  onLike: () => void;
  onSave: () => void;
  onBridge: () => void;
}) {
  return (
    <article className="post-card">
      <div className="post-header">
        <button className="person-button" onClick={onProfile}>
          <Avatar user={item.author} />
          <span>
            <strong>{item.author.display_name}</strong>
            <small>
              {item.location || `@${item.author.username}`}
            </small>
          </span>
        </button>
        <button className="icon-button" onClick={onOpen}>
          <MoreHorizontal size={20} />
        </button>
      </div>

      {item.image && (
        <button className="post-photo" onClick={onOpen}>
          <img
            src={media(item.image)}
            alt="Photograph shared by an Explorer"
          />
        </button>
      )}

      <div className="post-actions">
        <button
          className={item.liked ? "is-liked" : ""}
          onClick={onLike}
          aria-label="Like post"
        >
          <Heart
            size={21}
            fill={item.liked ? "currentColor" : "none"}
          />
          <span>{item.likes}</span>
        </button>
        <button onClick={onOpen} aria-label="View comments">
          <MessageCircle size={21} />
          <span>{item.comments}</span>
        </button>
        <button onClick={onBridge} aria-label="Explore more related cultural discoveries" title="Explore More">
          <Sparkles size={20} />
        </button>
        <button
          className={`save-action ${item.saved ? "saved" : ""}`}
          onClick={onSave}
          aria-label="Save post"
        >
          <Bookmark
            size={21}
            fill={item.saved ? "currentColor" : "none"}
          />
        </button>
      </div>

      <div className="post-caption">
        <strong>@{item.author.username}</strong>{" "}
        {item.body}
      </div>

      {item.topics.length > 0 && (
        <div className="post-topics">
          {item.topics.map((tag) => (
            <span key={tag}>#{tag}</span>
          ))}
        </div>
      )}
    </article>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    client.ping()
      .then(() => console.log("BYNTRA connected to Appwrite"))
      .catch((error) => console.error("Appwrite connection failed:", error));
  }, []);

  const [me, setMe] = useState<User | null>(null);
  const [page, setPage] = useState<Page>("home");
  const [history, setHistory] = useState<Page[]>([]);
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] =
    useState<"login" | "register">("register");
  const [authForm, setAuthForm] = useState({
    display_name: "",
    username: "",
    email: "",
    password: ""
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [posts, setPosts] = useState<Post[]>([]);
  const [people, setPeople] = useState<User[]>([]);
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [search, setSearch] = useState("");
  const [publicDiscoveries, setPublicDiscoveries] = useState<PublicDiscovery[]>([]);
  const [publicBusy, setPublicBusy] = useState(false);
  const [publicError, setPublicError] = useState("");
  const [publicLoaded, setPublicLoaded] = useState(false);
  const [qlooQuery, setQlooQuery] = useState("");
  const [qlooResults, setQlooResults] = useState<QlooEntity[]>([]);
  const [qlooRecommendations, setQlooRecommendations] = useState<QlooEntity[]>([]);
  const [qlooSaved, setQlooSaved] = useState<QlooSaved[]>([]);
  const [qlooSeed, setQlooSeed] = useState<QlooEntity | null>(null);
  const [qlooTarget, setQlooTarget] = useState("music");
  const [qlooLocation, setQlooLocation] = useState("");
  const [qlooBusy, setQlooBusy] = useState(false);
  const [qlooError, setQlooError] = useState("");
  const [qlooHasSearched, setQlooHasSearched] = useState(false);
  const [journeyQlooResults, setJourneyQlooResults] = useState<QlooEntity[]>([]);
  const [journeyQlooBusy, setJourneyQlooBusy] = useState(false);

  const [category, setCategory] = useState("");
  const [selectedPost, setSelectedPost] =
    useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [viewUser, setViewUser] = useState<User | null>(null);
  const [connections, setConnections] = useState<User[]>([]);
  const [connectionTab, setConnectionTab] =
    useState<"explorers" | "exploring">("explorers");

  const [newPost, setNewPost] = useState({
    body: "",
    location: "",
    image: "",
    topics: [] as string[]
  });
  const [uploading, setUploading] = useState(false);
  const [bridges, setBridges] = useState<Bridge[]>([]);
  const [exploreMoreQueries, setExploreMoreQueries] = useState<ExploreMoreResult["discovery_queries"]>([]);
  const [exploreMoreLoading, setExploreMoreLoading] = useState(false);
  const [editingCategories, setEditingCategories] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState<string[]>([]);
  const [topicDraft, setTopicDraft] = useState("");
  const [bridgeExplanations, setBridgeExplanations] = useState<Record<number, string>>({});
  const [bridgeExplaining, setBridgeExplaining] = useState<number | null>(null);
  const [forYouPosts, setForYouPosts] = useState<Post[]>([]);
  const [forYouPersonalized, setForYouPersonalized] = useState(false);
  const [journeyGenerating, setJourneyGenerating] = useState(false);
  const [journeyNotes, setJourneyNotes] = useState("");
  const [journeyForm, setJourneyForm] = useState({
    focus: "",
    style: "Balanced",
    partner_id: ""
  });
  const [selectedJourney, setSelectedJourney] =
    useState<Journey | null>(null);
  const [activity, setActivity] = useState("");
  const [invitations, setInvitations] = useState<JourneyInvitation[]>([]);
  const [activities, setActivities] = useState<JourneyActivity[]>([]);
  const [activityBusy, setActivityBusy] = useState(false);
  const [votingActivityId, setVotingActivityId] = useState<string | null>(null);
  const [invitationBusy, setInvitationBusy] = useState<number | null>(null);


  const [conversations, setConversations] =
    useState<Conversation[]>([]);
  const [currentConversation, setCurrentConversation] =
    useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState("");

  const [aiInput, setAiInput] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [profileForm, setProfileForm] = useState({
    display_name: "",
    bio: "",
    location: "",
    interests: [] as string[]
  });

  const [cameraOn, setCameraOn] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const localVideo = useRef<HTMLVideoElement>(null);
  const localStream = useRef<MediaStream | null>(null);

  const notify = (message: string) => {
    setNotice(message);
  };

  const fail = (err: unknown) => {
    setError(
      err instanceof Error ? err.message : String(err)
    );
  };

  const go = (next: Page) => {
    setError("");
    setHistory((old) => [...old, page]);
    setPage(next);
    window.scrollTo(0, 0);
  };

  const back = () => {
    setPage(history.at(-1) || "home");
    setHistory((old) => old.slice(0, -1));
  };

  const load = useCallback(async () => {
    if (!getToken()) return;
    try {
      const [user, allPosts, allPeople, allJourneys] =
        await Promise.all([
          request<User>("/api/me"),
          request<Post[]>("/api/posts"),
          request<User[]>("/api/users"),
          request<Journey[]>("/api/journeys")
        ]);

      setMe(user);
      setPosts(allPosts);
      try {
        const feed = await request<{posts: Post[]; personalized: boolean}>("/api/feed/for-you");
        setForYouPosts(feed.posts);
        setForYouPersonalized(feed.personalized);
      } catch {
        setForYouPosts(allPosts);
        setForYouPersonalized(false);
      }
      setPeople(allPeople);
      setJourneys(allJourneys);
      setProfileForm({
        display_name: user.display_name,
        bio: user.bio || "",
        location: user.location || "",
        interests: user.interests || []
      });
    } catch (err) {
      if (
        err instanceof Error &&
        /401|session|Sign in|Account not found/i.test(
          err.message
        )
      ) {
        clearToken();
        setMe(null);
      } else {
        fail(err);
      }
    }
  }, []);

  useEffect(() => {
    load().finally(() => setReady(true));
  }, [load]);

  useEffect(() => {
    if (!me) return;
    const timer = window.setInterval(() => {
      request<Post[]>("/api/posts")
        .then(setPosts)
        .catch(() => {});
    }, 20000);
    return () => window.clearInterval(timer);
  }, [me]);

  useEffect(() => {
    return () => {
      localStream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function submitAuth(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await post<{
        token: string;
        user: User;
      }>(`/api/auth/${authMode}`, authForm);
      setToken(result.token);
      await load();
      setPage("home");
      setShowAuth(false);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    clearToken();
    setMe(null);
    setShowAuth(false);
    setPage("home");
  }

  async function togglePost(
    item: Post,
    action: "like" | "save"
  ) {
    try {
      await post(`/api/posts/${item.id}/${action}`, {});
      const updated = await request<Post>(
        `/api/posts/${item.id}`
      );
      setPosts((old) =>
        old.map((p) => p.id === item.id ? updated : p)
      );
      if (selectedPost?.id === item.id) {
        setSelectedPost(updated);
      }
    } catch (err) {
      fail(err);
    }
  }

  async function openPost(item: Post) {
    try {
      setSelectedPost(item);
      setComments(
        await request<Comment[]>(
          `/api/posts/${item.id}/comments`
        )
      );
      go("post");
    } catch (err) {
      fail(err);
    }
  }

  async function addComment(e: FormEvent) {
    e.preventDefault();
    if (!selectedPost || !commentText.trim()) return;
    try {
      await post(
        `/api/posts/${selectedPost.id}/comments`,
        { body: commentText }
      );
      setComments(
        await request<Comment[]>(
          `/api/posts/${selectedPost.id}/comments`
        )
      );
      setCommentText("");
      await load();
    } catch (err) {
      fail(err);
    }
  }

  async function follow(user: User) {
    try {
      await post(`/api/users/${user.id}/follow`, {});
      await load();
      if (page === "explorers") {
        setConnections(
          await request<User[]>(
            `/api/connections/${connectionTab}`
          )
        );
      }
      if (viewUser?.id === user.id) {
        setViewUser(
          await request<User>(`/api/users/${user.id}`)
        );
      }
    } catch (err) {
      fail(err);
    }
  }

  function profile(user?: User) {
    setViewUser(user || me);
    go("profile");
  }

  async function chooseImage(
    e: ChangeEvent<HTMLInputElement>,
    kind: "post" | "avatar"
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await upload(file);
      if (kind === "post") {
        setNewPost((old) => ({ ...old, image: url }));
      } else {
        await put("/api/me/avatar", { url });
        await load();
      }
    } catch (err) {
      fail(err);
    } finally {
      setUploading(false);
    }
  }

  async function publish(e: FormEvent) {
    e.preventDefault();
    if (!newPost.body.trim()) return;
    setBusy(true);
    try {
      await post("/api/posts", newPost);
      setNewPost({
        body: "", image: "", location: "", topics: []
      });
      await load();
      go("home");
      notify("Your post has been published.");
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function showConnections(
    kind: "explorers" | "exploring"
  ) {
    try {
      setConnectionTab(kind);
      setConnections(
        await request<User[]>(`/api/connections/${kind}`)
      );
      go("explorers");
    } catch (err) {
      fail(err);
    }
  }

  async function showBridges(item: Post) {
    setSelectedPost(item);
    setExploreMoreLoading(true);
    setBridges([]);
    setExploreMoreQueries([]);
    go("bridges");
    try {
      const result = await request<ExploreMoreResult>(`/api/posts/${item.id}/explore-more`);
      setBridges(result.related_posts);
      setExploreMoreQueries(result.discovery_queries);
      setBridgeExplanations({});
    } catch (err) { fail(err); }
    finally { setExploreMoreLoading(false); }
  }

  async function savePostCategories() {
    if (!selectedPost || !me || selectedPost.user_id !== me.id) return;
    try {
      const updated = await put<Post>(`/api/posts/${selectedPost.id}/categories`, {
        categories: categoryDraft,
        topics: topicDraft.split(",").map(x => x.trim()).filter(Boolean)
      });
      setSelectedPost(updated);
      setPosts(old => old.map(p => p.id === updated.id ? updated : p));
      setEditingCategories(false);
      notify("Post categories updated.");
    } catch (err) { fail(err); }
  }

  async function explainBridge(relatedId: number) {
    if (!selectedPost) return;
    setBridgeExplaining(relatedId);
    try {
      const data = await post<{explanation: string}>(
        `/api/bridges/${selectedPost.id}/explain`,
        {related_post_id: relatedId}
      );
      setBridgeExplanations(old => ({...old, [relatedId]: data.explanation}));
    } catch (err) { fail(err); }
    finally { setBridgeExplaining(null); }
  }

  async function generateJourney() {
    if (!selectedJourney) return;
    setJourneyGenerating(true);
    try {
      await post(`/api/journeys/${selectedJourney.id}/generate`, {notes: journeyNotes});
      const updated = await request<Journey[]>("/api/journeys");
      setJourneys(updated);
      setSelectedJourney(updated.find(j => j.id === selectedJourney.id) || null);
      notify("AI journey suggestion saved. Review before adding activities.");
    } catch (err) { fail(err); }
    finally { setJourneyGenerating(false); }
  }

  const refreshJourneyData = useCallback(async () => {
    const [allJourneys, pending] = await Promise.all([
      request<Journey[]>("/api/journeys"),
      request<{ invitations: JourneyInvitation[]; count: number }>(
        "/api/journeys/invitations/pending"
      )
    ]);
    setJourneys(allJourneys);
    setInvitations(pending.invitations);
    setSelectedJourney((old) =>
      old ? allJourneys.find((item) => item.id === old.id) || null : null
    );
  }, []);

  useEffect(() => {
    if (!me || page !== "journeys") return;
    void refreshJourneyData().catch(fail);
  }, [me?.id, page, refreshJourneyData]);

  useEffect(() => {
    if (!me || !selectedJourney || page !== "together") return;
    const journeyId = selectedJourney.id;
    let active = true;
    request<JourneyActivityResponse>(`/api/journeys/${journeyId}/activities`)
      .then((result) => {
        if (active) setActivities(result.activities);
      })
      .catch((err) => {
        if (active) fail(err);
      });
    return () => { active = false; };
  }, [me?.id, page, selectedJourney?.id]);

  async function respondToJourney(journeyId: number, action: "accept" | "decline") {
    setInvitationBusy(journeyId);
    try {
      await post(`/api/journeys/${journeyId}/respond`, { action });
      await refreshJourneyData();
      notify(action === "accept" ? "Invitation accepted." : "Invitation declined.");
    } catch (err) {
      fail(err);
    } finally {
      setInvitationBusy(null);
    }
  }

  async function deleteJourneyActivity(activityId: string) {
    if (!selectedJourney || activityBusy) return;
    setActivityBusy(true);
    try {
      const result = await remove(`/api/journeys/${selectedJourney.id}/activities/${encodeURIComponent(activityId)}`) as JourneyActivityResponse;
      setActivities(result.activities);
      const allJourneys = await request<Journey[]>("/api/journeys");
      setJourneys(allJourneys);
      setSelectedJourney(allJourneys.find((j) => j.id === selectedJourney.id) || null);
      notify("Activity removed from the shared plan.");
    } catch (err) {
      fail(err);
    } finally {
      setActivityBusy(false);
    }
  }

  async function voteJourneyActivity(activityId: string, vote: "yes" | "no" | "clear") {
    if (!selectedJourney || votingActivityId) return;
    setVotingActivityId(activityId);
    try {
      const result = await post<JourneyActivityResponse>(
        `/api/journeys/${selectedJourney.id}/activities/${encodeURIComponent(activityId)}/vote`,
        { vote }
      );
      setActivities(result.activities);
      const updated = await request<Journey[]>("/api/journeys");
      setJourneys(updated);
      setSelectedJourney(updated.find((j) => j.id === selectedJourney.id) || null);
      notify(vote === "clear" ? "Vote removed." : "Your vote was saved.");
    } catch (err) {
      fail(err);
    } finally {
      setVotingActivityId(null);
    }
  }

  async function createJourney(e: FormEvent) {
    e.preventDefault();
    try {
      await post("/api/journeys", {
        focus: journeyForm.focus,
        style: journeyForm.style,
        partner_id: journeyForm.partner_id
          ? Number(journeyForm.partner_id)
          : null
      });
      setJourneys(
        await request<Journey[]>("/api/journeys")
      );
      const invited = Boolean(journeyForm.partner_id);
      setJourneyForm({
        focus: "",
        style: "Balanced",
        partner_id: ""
      });
      await refreshJourneyData();
      notify(invited ? "Journey invitation sent." : "Solo journey saved.");
    } catch (err) {
      fail(err);
    }
  }

  async function addActivity(e: FormEvent) {
    e.preventDefault();
    if (!selectedJourney || !activity.trim()) return;
    try {
      await post(
        `/api/journeys/${selectedJourney.id}/activities`,
        { activity }
      );
      const updated =
        await request<Journey[]>("/api/journeys");
      setJourneys(updated);
      setSelectedJourney(
        updated.find((j) => j.id === selectedJourney.id)
          || null
      );
      setActivity("");
      const result = await request<JourneyActivityResponse>(`/api/journeys/${selectedJourney.id}/activities`);
      setActivities(result.activities);
    } catch (err) {
      fail(err);
    }
  }

  async function openMessages() {
    try {
      setConversations(
        await request<Conversation[]>(
          "/api/conversations"
        )
      );
      go("messages");
    } catch (err) {
      fail(err);
    }
  }

  async function selectConversation(c: Conversation) {
    try {
      setCurrentConversation(c);
      setMessages(
        await request<Message[]>(
          `/api/conversations/${c.id}/messages`
        )
      );
    } catch (err) {
      fail(err);
    }
  }

  async function startConversation(user: User) {
    try {
      const result = await post<{ id: number }>(
        `/api/conversations/${user.id}`,
        {}
      );
      const c = { id: result.id, other: user };
      setCurrentConversation(c);
      setMessages(
        await request<Message[]>(
          `/api/conversations/${c.id}/messages`
        )
      );
      setConversations(
        await request<Conversation[]>(
          "/api/conversations"
        )
      );
      go("messages");
    } catch (err) {
      fail(err);
    }
  }

  async function sendMessage(e: FormEvent) {
    e.preventDefault();
    if (!currentConversation || !messageText.trim()) return;
    try {
      await post(
        `/api/conversations/${currentConversation.id}/messages`,
        { body: messageText }
      );
      setMessages(
        await request<Message[]>(
          `/api/conversations/${currentConversation.id}/messages`
        )
      );
      setMessageText("");
    } catch (err) {
      fail(err);
    }
  }

  useEffect(() => {
    if (!currentConversation || page !== "messages") return;
    const timer = window.setInterval(() => {
      request<Message[]>(
        `/api/conversations/${currentConversation.id}/messages`
      ).then(setMessages).catch(() => {});
    }, 3500);
    return () => window.clearInterval(timer);
  }, [currentConversation, page]);

  async function askAI(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setAiResponse("");
    try {
      const result = await post<{ answer: string }>(
        "/api/ai/assist",
        { prompt: aiInput }
      );
      setAiResponse(result.answer);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    try {
      await put("/api/me", profileForm);
      await load();
      notify("Profile updated.");
      profile();
    } catch (err) {
      fail(err);
    }
  }

  async function startCamera() {
    try {
      const stream =
        await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true
        });
      localStream.current = stream;
      if (localVideo.current) {
        localVideo.current.srcObject = stream;
      }
      setCameraOn(true);
      setMicOn(true);
    } catch (err) {
      fail(err);
    }
  }

  function stopCamera() {
    localStream.current?.getTracks().forEach((t) => t.stop());
    localStream.current = null;
    if (localVideo.current) {
      localVideo.current.srcObject = null;
    }
    setCameraOn(false);
    setMicOn(false);
  }

  useEffect(() => {
    if (!me || page !== "explore") return;
    let active = true;
    setPublicBusy(true);
    setPublicError("");
    setPublicLoaded(false);
    const timer = window.setTimeout(async () => {
      const params = new URLSearchParams();
      if (category) params.set("category", category);
      if (search.trim()) params.set("q", search.trim());
      if (!category && !search.trim() && me.interests?.length) {
        params.set("interests", me.interests.slice(0, 2).join(" "));
      }
      try {
        const data = await request<PublicDiscoveryResponse>(
          `/api/discovery?${params.toString()}`
        );
        if (active) setPublicDiscoveries(data.results);
      } catch (err) {
        if (active) {
          setPublicDiscoveries([]);
          setPublicError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (active) { setPublicBusy(false); setPublicLoaded(true); }
      }
    }, 350);
    return () => { active = false; window.clearTimeout(timer); };
  }, [me?.id, me?.interests?.join("|"), page, category, search]);

  const refreshQlooSaved = useCallback(async () => {
    if (!getToken()) return;
    try {
      setQlooSaved(await request<QlooSaved[]>("/api/qloo/saved"));
    } catch {
      // The social app remains usable until Qloo routes are configured.
    }
  }, []);

  useEffect(() => {
    if (me) void refreshQlooSaved();
    else setQlooSaved([]);
  }, [me?.id, refreshQlooSaved]);

  async function searchQloo(e: FormEvent) {
    e.preventDefault();
    if (qlooQuery.trim().length < 2) return;
    setQlooBusy(true);
    setQlooError("");
    setQlooHasSearched(true);
    setQlooResults([]);
    setQlooRecommendations([]);
    setQlooSeed(null);
    try {
      const params = new URLSearchParams({ q: qlooQuery.trim() });
      if (qlooCategories[category]) params.set("category", qlooCategories[category]);
      const result = await request<QlooSearchResponse>(`/api/qloo/search?${params}`);
      setQlooResults(result.results);
    } catch (err) {
      setQlooError(err instanceof Error ? err.message : String(err));
    } finally {
      setQlooBusy(false);
    }
  }

  async function findQlooConnections() {
    if (!qlooSeed) return;
    setQlooBusy(true);
    setQlooError("");
    setQlooRecommendations([]);
    try {
      const result = await post<QlooRecommendations>("/api/qloo/recommend", {
        category: qlooTarget,
        entity_ids: [qlooSeed.id],
        location: qlooLocation.trim() || null,
        limit: 12
      });
      setQlooRecommendations(result.results);
    } catch (err) {
      setQlooError(err instanceof Error ? err.message : String(err));
    } finally {
      setQlooBusy(false);
    }
  }

  async function toggleQlooSave(item: QlooEntity, selectedCategory: string) {
    const existing = qlooSaved.find((saved) => saved.entity_id === item.id);
    setQlooError("");
    try {
      if (existing) {
        await remove(`/api/qloo/saved/${encodeURIComponent(item.id)}`);
      } else {
        await post("/api/qloo/saved", {
          entity_id: item.id,
          name: item.name,
          category: selectedCategory,
          image: item.image || null
        });
      }
      await refreshQlooSaved();
    } catch (err) {
      setQlooError(err instanceof Error ? err.message : String(err));
    }
  }

  async function findJourneyQloo() {
    if (!selectedJourney || !qlooSeed) return;
    setJourneyQlooBusy(true);
    setQlooError("");
    setJourneyQlooResults([]);
    try {
      const result = await post<{ recommendations: QlooRecommendations }>(
        `/api/qloo/journeys/${selectedJourney.id}/recommend`,
        {
          category: qlooTarget,
          entity_ids: [qlooSeed.id],
          location: qlooLocation.trim() || null,
          limit: 8
        }
      );
      setJourneyQlooResults(result.recommendations.results);
    } catch (err) {
      setQlooError(err instanceof Error ? err.message : String(err));
    } finally {
      setJourneyQlooBusy(false);
    }
  }

  function qlooEntityCard(item: QlooEntity, selectedCategory: string) {
    const saved = qlooSaved.some((s) => s.entity_id === item.id);
    return (
      <article className="qloo-entity-card" key={`${selectedCategory}-${item.id}`}>
        {item.image ? (
          <img className="qloo-entity-image" src={item.image} alt={item.name} loading="lazy" />
        ) : (
          <div className="qloo-entity-image qloo-entity-fallback"><Compass size={25} /></div>
        )}
        <div className="qloo-entity-details">
          <strong>{item.name}</strong>
          <small>Qloo cultural discovery</small>
          <button
            type="button"
            className="qloo-save-button"
            onClick={() => void toggleQlooSave(item, selectedCategory)}
            aria-label={saved ? `Remove ${item.name} from saved discoveries` : `Save ${item.name}`}
          >
            <Bookmark size={16} fill={saved ? "currentColor" : "none"} />
            {saved ? "Saved" : "Save"}
          </button>
        </div>
      </article>
    );
  }

  const filteredPosts = posts.filter((item) => {
    const matchesCategory =
      !category ||
      item.topics.some(
        (t) => t.toLowerCase() === category.toLowerCase()
      );
    const searchable = [
      item.body,
      item.location,
      item.author.display_name,
      ...item.topics
    ].join(" ").toLowerCase();
    return matchesCategory &&
      searchable.includes(search.toLowerCase());
  });

  const filteredPeople = people.filter((user) =>
    [
      user.display_name,
      user.username,
      ...user.interests
    ].join(" ").toLowerCase().includes(
      search.toLowerCase()
    )
  );

  const activeProfile = viewUser || me;

  const postActions = (item: Post) => ({
    item,
    onProfile: () => profile(item.author),
    onOpen: () => openPost(item),
    onLike: () => togglePost(item, "like"),
    onSave: () => togglePost(item, "save"),
    onBridge: () => showBridges(item)
  });

  const title: Record<Page, string> = {
    home: "BYNTRA",
    explore: "Explore",
    create: "Create Post",
    profile: "Profile",
    explorers: "Explorers",
    post: "Post Detail",
    bridges: "Bridge This Post",
    journeys: "Shared Journeys",
    together: "TogetherSpace",
    messages: "Messages",
    assistant: "BYNTRA AI",
    settings: "Edit Profile"
  };

  if (!ready) {
    return (
      <div className="loading-screen">
        <h1>BYNTRA</h1>
        <p>Find the Path Between Us</p>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="welcome-screen">
        <div className="welcome-image" />
        <div className="welcome-overlay" />

        {!showAuth ? (
          <div className="welcome-layout">
            <div className="welcome-brand">
  <h1>BYNTRA</h1>
  <p>Find the Path Between Us</p>
</div>

            <div className="welcome-bottom">
              <p>
                Discover people, cultures and new perspectives
                through shared experiences.
              </p>
              <button
                className="cream-button"
                onClick={() => {
                  setAuthMode("register");
                  setShowAuth(true);
                }}
              >
                Get Started
              </button>
              <button
                className="outline-button"
                onClick={() => {
                  setAuthMode("login");
                  setShowAuth(true);
                }}
              >
                I Already Have an Account
              </button>
            </div>
          </div>
        ) : (
          <div className="auth-wrapper">
            <form className="auth-card" onSubmit={submitAuth}>
              <button
                type="button"
                className="back-button"
                onClick={() => {
                  setShowAuth(false);
                  setError("");
                }}
              >
                <ArrowLeft size={18} /> Back
              </button>
              <div className="auth-logo">BYNTRA</div>
              <h2>
                {authMode === "register"
                  ? "Begin your journey"
                  : "Welcome back"}
              </h2>
              <p>Find the Path Between Us</p>

              {error && (
                <div className="error-message">{error}</div>
              )}

              {authMode === "register" && (
                <>
                  <label>
                    Display name
                    <input
                      required
                      autoComplete="name"
                      value={authForm.display_name}
                      onChange={(e) => setAuthForm({
                        ...authForm,
                        display_name: e.target.value
                      })}
                    />
                  </label>
                  <label>
                    Username
                    <input
                      required
                      minLength={3}
                      autoComplete="username"
                      value={authForm.username}
                      onChange={(e) => setAuthForm({
                        ...authForm,
                        username: e.target.value
                      })}
                    />
                  </label>
                </>
              )}

              <label>
                Email
                <input
                  required
                  type="email"
                  autoComplete="email"
                  value={authForm.email}
                  onChange={(e) => setAuthForm({
                    ...authForm,
                    email: e.target.value
                  })}
                />
              </label>

              <label>
                Password
                <input
                  required
                  type="password"
                  minLength={8}
                  autoComplete={
                    authMode === "register"
                      ? "new-password"
                      : "current-password"
                  }
                  value={authForm.password}
                  onChange={(e) => setAuthForm({
                    ...authForm,
                    password: e.target.value
                  })}
                />
              </label>

              <button className="cream-button" disabled={busy}>
                {busy ? "Please wait..." :
                  authMode === "register"
                    ? "Create Account"
                    : "Sign In"}
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setAuthMode(
                    authMode === "register"
                      ? "login"
                      : "register"
                  );
                  setError("");
                }}
              >
                {authMode === "register"
                  ? "Already have an account? Sign in"
                  : "New here? Create an account"}
              </button>
            </form>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="desktop-sidebar">
        <h1>BYNTRA</h1>
        <p>Find the Path Between Us</p>

        <nav>
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={page === id ? "active" : ""}
              onClick={() => {
                if (id === "profile") setViewUser(me);
                go(id);
              }}
            >
              <Icon size={20} />
              {label}
            </button>
          ))}
          <button onClick={() => go("assistant")}>
            <Sparkles size={20} /> BYNTRA AI
          </button>
          <button onClick={openMessages}>
            <MessageCircle size={20} /> Messages
          </button>
          <button onClick={() => go("settings")}>
            <Settings size={20} /> Settings
          </button>
        </nav>

        <div className="sidebar-user">
          <Avatar user={me} />
          <div>
            <strong>{me.display_name}</strong>
            <small>@{me.username}</small>
          </div>
          <button onClick={logout} title="Sign out">
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      <main className="app-main">
        <header className="app-header">
          <div>
            {!["home", "explore", "journeys"].includes(page) &&
              <button className="icon-button" onClick={back}>
                <ArrowLeft size={20} />
              </button>}
            <span className={page === "home" ? "header-brand" : ""}>
              {title[page]}
            </span>
          </div>
          <div className="header-actions">
            <button
              className="icon-button"
              onClick={() => load()}
              title="Refresh"
            >
              <RefreshCw size={19} />
            </button>
            <button
              className="icon-button"
              onClick={openMessages}
              title="Messages"
            >
              <MessageCircle size={20} />
            </button>
            <button
              className="icon-button"
              onClick={() => profile(me)}
            >
              <Avatar user={me} size={30} />
            </button>
          </div>
        </header>

        {error && (
          <div className="error-message">
            {error}
            <button onClick={() => setError("")}>
              <X size={17} />
            </button>
          </div>
        )}

        {notice && (
          <div className="notice">
            {notice}
            <button onClick={() => setNotice("")}>×</button>
          </div>
        )}

        <div className="page-content">
          {page === "home" && (
            <div className="feed-container">
              <div className="story-strip">
                <button onClick={() => go("create")}>
                  <span className="story-ring">
                    <Plus size={26} />
                  </span>
                  <small>Your Story</small>
                </button>
                {people.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => profile(user)}
                  >
                    <span className="story-ring">
                      <Avatar user={user} size={57} />
                    </span>
                    <small>{user.display_name.split(" ")[0]}</small>
                  </button>
                ))}
              </div>

              <div className="feed-heading">
                <h2>For You</h2>
                <button onClick={() => go("explore")}>
                  Explore <ChevronRight size={16} />
                </button>
              </div>

              {forYouPersonalized && <p className="integration-note">For You is ranked using your profile interests, saved topics and Explorers you follow.</p>}
              {(forYouPosts.length || posts.length) ? (
                (forYouPosts.length ? forYouPosts : posts).map((item) => (
                  <PostCard
                    key={item.id}
                    {...postActions(item)}
                  />
                ))
              ) : (
                <Empty
                  title="Your story begins here"
                  description="No Explorers have shared a post yet. Be the first to share a cultural discovery."
                >
                  <button
                    className="cream-button"
                    onClick={() => go("create")}
                  >
                    Create Post
                  </button>
                </Empty>
              )}
            </div>
          )}

          {page === "explore" && (
            <div>
              <div className="search-box">
                <Search size={19} />
                <input
                  placeholder="Search cultures, places, people..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div className="category-scroll">
                <button
                  className={!category ? "selected" : ""}
                  onClick={() => setCategory("")}
                >
                  For You
                </button>
                {categories.map((name) => (
                  <button
                    key={name}
                    className={category === name ? "selected" : ""}
                    onClick={() => setCategory(
                      category === name ? "" : name
                    )}
                  >
                    {name}
                  </button>
                ))}
              </div>

              {!search && !category && (
                <div className="category-grid">
                  {categories.map((name, index) => {
                    const Icon = categoryIcons[index];
                    return (
                      <button
                        key={name}
                        className="category-tile"
                        onClick={() => setCategory(name)}
                      >
                        <Icon size={28} />
                        <strong>{name}</strong>
                        <small>Explore discoveries</small>
                      </button>
                    );
                  })}
                </div>
              )}

              <section className="public-discovery" aria-label="Cultural discovery gallery">
                <div className="public-discovery-heading">
                  <div>
                    <span className="qloo-eyebrow"><Compass size={15} /> Cultural atlas</span>
                    <h2>{category || (search ? "Search Results" : "Explore the World")}</h2>
                    <p>Explore real cultural articles and imagery from Wikipedia.
                      {!category && !search && me.interests?.length
                        ? " Based on your profile interests, not AI recommendations."
                        : " Browse editorial search results, not AI recommendations."}
                    </p>
                  </div>
                </div>
                {publicBusy && <p className="qloo-hint" role="status">Loading real cultural discoveries...</p>}
                {publicError && <p className="qloo-error" role="alert">Discovery source unavailable: {publicError}</p>}
                {!publicBusy && !publicError && publicLoaded && !publicDiscoveries.length && (
                  <p className="qloo-hint">No matching articles found. Try another search.</p>
                )}
                {!!publicDiscoveries.length && (
                  <div className="public-discovery-grid">
                    {publicDiscoveries.map((item) => (
                      <a className="public-discovery-card" key={item.id}
                        href={item.url || undefined} target="_blank" rel="noopener noreferrer"
                        aria-label={`Read about ${item.title} on Wikipedia`}>
                        {item.image ? <img src={item.image} alt="" loading="lazy" /> : (
                          <span className="public-discovery-fallback"><Globe2 size={32} /></span>
                        )}
                        <span className="public-discovery-caption">
                          <small>{item.source} · Article</small>
                          <strong>{item.title}</strong>
                        </span>
                      </a>
                    ))}
                  </div>
                )}
                <p className="public-discovery-credit">Article titles and thumbnails from Wikipedia. These are external articles, not Qloo results.</p>
              </section>

              <section className="qloo-section" aria-label="Live cultural discovery">
                <div className="qloo-section-heading">
                  <span className="qloo-eyebrow"><Sparkles size={15} /> Taste intelligence</span>
                  <h2>Discover Beyond Your World</h2>
                  <p>Search real cultural entities and find connections between the things you love.</p>
                </div>
                <form className="qloo-search-form" onSubmit={searchQloo}>
                  <Search size={19} aria-hidden="true" />
                  <input
                    aria-label="Search Qloo cultural interests"
                    value={qlooQuery}
                    onChange={(e) => setQlooQuery(e.target.value)}
                    placeholder="A favourite film, artist, book or place..."
                    minLength={2}
                    maxLength={150}
                    required
                  />
                  <button type="submit" disabled={qlooBusy || qlooQuery.trim().length < 2}>
                    {qlooBusy ? "Searching..." : "Search"}
                  </button>
                </form>
                {category && !qlooCategories[category] && (
                  <p className="qloo-hint">
                    Live Qloo search is not available for {category} yet. Community posts remain searchable below.
                  </p>
                )}
                {qlooError && <p className="qloo-error" role="alert">{qlooError}</p>}
                {qlooHasSearched && !qlooBusy && !qlooError && qlooResults.length === 0 && (
                  <p className="qloo-hint">No verified entities found for that search. Try another name or category.</p>
                )}
                {qlooResults.length > 0 && (
                  <>
                    <h3 className="qloo-subheading">Choose an interest</h3>
                    <div className="qloo-results-grid">
                      {qlooResults.map((item) => (
                        <button
                          type="button"
                          key={item.id}
                          className={`qloo-select-card ${qlooSeed?.id === item.id ? "qloo-selected" : ""}`}
                          onClick={() => { setQlooSeed(item); setQlooRecommendations([]); }}
                        >
                          {item.image ? <img src={item.image} alt="" loading="lazy" /> : <Compass size={23} />}
                          <span>{item.name}</span>
                          {qlooSeed?.id === item.id && <Check size={17} />}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {qlooSeed && (
                  <div className="qloo-bridge-controls">
                    <p>Find connections from <strong>{qlooSeed.name}</strong> to:</p>
                    <div className="qloo-control-row">
                      <select aria-label="Recommendation category" value={qlooTarget} onChange={(e) => setQlooTarget(e.target.value)}>
                        {qlooTargets.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                      </select>
                      <input
                        aria-label="Optional city or region"
                        placeholder="City or region (optional)"
                        value={qlooLocation}
                        onChange={(e) => setQlooLocation(e.target.value)}
                        maxLength={150}
                      />
                      <button type="button" disabled={qlooBusy} onClick={() => void findQlooConnections()}>
                        <Sparkles size={17} /> {qlooBusy ? "Finding..." : "Find Connections"}
                      </button>
                    </div>
                  </div>
                )}
                {qlooRecommendations.length > 0 && (
                  <>
                    <h3 className="qloo-subheading">Recommended for your taste</h3>
                    <div className="qloo-entity-grid">
                      {qlooRecommendations.map((item) => qlooEntityCard(item, qlooTarget))}
                    </div>
                  </>
                )}
                {qlooSaved.length > 0 && (
                  <>
                    <h3 className="qloo-subheading">Your saved discoveries</h3>
                    <div className="qloo-entity-grid">
                      {qlooSaved.map((item) => qlooEntityCard({
                        id: item.entity_id,
                        name: item.name,
                        image: item.image,
                        source: "qloo"
                      }, item.category))}
                    </div>
                  </>
                )}
                <p className="qloo-attribution">Powered by Qloo. Live search requires backend API access; no sample recommendations are displayed.</p>
              </section>

              <h2 className="section-title">
                Cultural Discoveries
              </h2>

              {filteredPosts.length ? (
                <div className="discovery-grid">
                  {filteredPosts.map((item) => (
                    <button
                      className="discovery-card"
                      key={item.id}
                      onClick={() => openPost(item)}
                    >
                      {item.image ? (
                        <img
                          src={media(item.image)}
                          alt={item.body}
                        />
                      ) : (
                        <div className="discovery-placeholder">
                          <Globe2 size={28} />
                        </div>
                      )}
                      <div className="discovery-caption">
                        <small>
                          {item.topics.join(" · ") || "Culture"}
                        </small>
                        <strong>{item.body}</strong>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <Empty
                  title="No discoveries found"
                  description="Real community posts matching your search will appear here."
                />
              )}

              <h2 className="section-title">Discover Explorers</h2>
              {filteredPeople.map((user) => (
                <div className="person-row" key={user.id}>
                  <button
                    className="person-button"
                    onClick={() => profile(user)}
                  >
                    <Avatar user={user} size={48} />
                    <span>
                      <strong>{user.display_name}</strong>
                      <small>
                        {user.interests.join(" · ") ||
                          `@${user.username}`}
                      </small>
                    </span>
                  </button>
                  <button
                    className="small-pill"
                    onClick={() => follow(user)}
                  >
                    {user.following ? "Following" : "Explore"}
                  </button>
                </div>
              ))}
            </div>
          )}

          {page === "create" && (
            <div className="narrow-page">
              <form className="cream-panel" onSubmit={publish}>
                <div className="create-header">
                  <Avatar user={me} />
                  <span>
                    <strong>{me.display_name}</strong>
                    <small>Share a cultural discovery</small>
                  </span>
                </div>

                <textarea
                  required
                  rows={5}
                  maxLength={3000}
                  placeholder="Sharing a hidden gem..."
                  value={newPost.body}
                  onChange={(e) => setNewPost({
                    ...newPost,
                    body: e.target.value
                  })}
                />

                {newPost.image && (
                  <div className="upload-preview">
                    <img
                      src={media(newPost.image)}
                      alt="Selected post"
                    />
                    <button
                      type="button"
                      onClick={() => setNewPost({
                        ...newPost, image: ""
                      })}
                    >
                      <X size={20} />
                    </button>
                  </div>
                )}

                <label className="create-row upload-label">
                  <ImagePlus size={20} />
                  {uploading ? "Uploading..." : "Add Photos"}
                  <input
                    hidden
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => chooseImage(e, "post")}
                  />
                </label>

                <label className="create-row">
                  <MapPin size={20} />
                  <input
                    placeholder="Add location"
                    value={newPost.location}
                    onChange={(e) => setNewPost({
                      ...newPost,
                      location: e.target.value
                    })}
                  />
                </label>

                <div className="create-row">
                  <Palette size={20} />
                  <span>Tag topics</span>
                </div>

                <div className="chips">
                  {categories.map((name) => (
                    <button
                      type="button"
                      key={name}
                      className={
                        newPost.topics.includes(name)
                          ? "selected" : ""
                      }
                      onClick={() => setNewPost((old) => ({
                        ...old,
                        topics: old.topics.includes(name)
                          ? old.topics.filter((x) => x !== name)
                          : [...old.topics, name]
                      }))}
                    >
                      {name}
                    </button>
                  ))}
                </div>

                <button
                  className="dark-button"
                  disabled={
                    busy || uploading || !newPost.body.trim()
                  }
                >
                  {busy ? "Publishing..." : "Share Your Post"}
                </button>
              </form>
            </div>
          )}

          {page === "profile" && activeProfile && (
            <div className="profile-page">
              <div className="profile-top">
                <Avatar user={activeProfile} size={85} />
                <div>
                  <h2>{activeProfile.display_name}</h2>
                  <small>@{activeProfile.username}</small>
                </div>
              </div>

              <p className="profile-bio">
                {activeProfile.bio || "No bio added yet."}
              </p>
              {activeProfile.location && (
                <p className="muted">
                  <MapPin size={15} /> {activeProfile.location}
                </p>
              )}

              <div className="profile-interests">
                {activeProfile.interests.map((interest) => (
                  <span key={interest}>{interest}</span>
                ))}
              </div>

              <div className="profile-stats">
                <button onClick={() =>
                  showConnections("explorers")
                }>
                  <strong>{activeProfile.explorers}</strong>
                  <small>Explorers</small>
                </button>
                <button onClick={() =>
                  showConnections("exploring")
                }>
                  <strong>{activeProfile.exploring}</strong>
                  <small>Exploring</small>
                </button>
                <div>
                  <strong>{activeProfile.journeys}</strong>
                  <small>Journeys</small>
                </div>
                <div>
                  <strong>{activeProfile.posts}</strong>
                  <small>Posts</small>
                </div>
              </div>

              <div className="profile-buttons">
                {activeProfile.id === me.id ? (
                  <button
                    className="cream-button"
                    onClick={() => go("settings")}
                  >
                    Edit Profile
                  </button>
                ) : (
                  <>
                    <button
                      className="cream-button"
                      onClick={() => follow(activeProfile)}
                    >
                      {activeProfile.following
                        ? "Following" : "Explore"}
                    </button>
                    <button
                      className="outline-button"
                      onClick={() =>
                        startConversation(activeProfile)
                      }
                    >
                      Message
                    </button>
                  </>
                )}
              </div>

              <div className="profile-tabs">
                <span>Posts</span>
                <button onClick={() => go("journeys")}>
                  Journeys
                </button>
                <button onClick={() => go("explore")}>
                  Explore
                </button>
              </div>

              <div className="profile-post-grid">
                {posts
                  .filter((p) => p.user_id === activeProfile.id)
                  .map((item) => (
                    <button
                      key={item.id}
                      onClick={() => openPost(item)}
                    >
                      {item.image ? (
                        <img
                          src={media(item.image)}
                          alt={item.body}
                        />
                      ) : (
                        <span>{item.body}</span>
                      )}
                    </button>
                  ))}
              </div>
            </div>
          )}

          {page === "explorers" && (
            <div className="narrow-page">
              <div className="connection-tabs">
                {(["explorers", "exploring"] as const)
                  .map((kind) => (
                    <button
                      key={kind}
                      className={
                        connectionTab === kind ? "selected" : ""
                      }
                      onClick={async () => {
                        setConnectionTab(kind);
                        try {
                          setConnections(
                            await request<User[]>(
                              `/api/connections/${kind}`
                            )
                          );
                        } catch (err) {
                          fail(err);
                        }
                      }}
                    >
                      {kind === "explorers"
                        ? "Explorers" : "Exploring"}
                    </button>
                  ))}
              </div>

              {connections.length ? (
                connections.map((user) => (
                  <div className="person-row" key={user.id}>
                    <button
                      className="person-button"
                      onClick={() => profile(user)}
                    >
                      <Avatar user={user} />
                      <span>
                        <strong>{user.display_name}</strong>
                        <small>
                          {user.interests.join(" · ")}
                        </small>
                      </span>
                    </button>
                    <button
                      className="small-pill"
                      onClick={() => follow(user)}
                    >
                      {user.following
                        ? "Following" : "Explore"}
                    </button>
                  </div>
                ))
              ) : (
                <Empty
                  title="No connections yet"
                  description="Discover Explorers through the community."
                />
              )}
            </div>
          )}

          {page === "post" && selectedPost && (
            <div className="narrow-page">
              <PostCard {...postActions(selectedPost)} />

              {selectedPost.user_id === me.id && (
                <button
                  className="danger-button"
                  onClick={async () => {
                    if (!window.confirm("Delete this post?"))
                      return;
                    try {
                      await remove(
                        `/api/posts/${selectedPost.id}`
                      );
                      await load();
                      go("home");
                    } catch (err) {
                      fail(err);
                    }
                  }}
                >
                  <Trash2 size={16} /> Delete Post
                </button>
              )}

              <div className="dark-panel">
                <h3>Conversations</h3>
                {comments.map((comment) => (
                  <div className="comment-row" key={comment.id}>
                    <Avatar user={comment.author} size={35} />
                    <div>
                      <strong>
                        {comment.author.display_name}
                      </strong>
                      <p>{comment.body}</p>
                    </div>
                  </div>
                ))}

                <form className="send-form" onSubmit={addComment}>
                  <input
                    required
                    placeholder="Share your thoughts..."
                    value={commentText}
                    onChange={(e) =>
                      setCommentText(e.target.value)
                    }
                  />
                  <button>
                    <Send size={19} />
                  </button>
                </form>
              </div>
            </div>
          )}

          {page === "bridges" && (
            <div className="narrow-page">
              <div className="cream-panel">
                <div className="bridge-title">
                  <Sparkles size={24} />
                  <div>
                    <h3>Explore More</h3>
                    <p>
                      Discover how this post connects with
                      other community interests.
                    </p>
                  </div>
                </div>

                <p className="integration-note">
                  Explore More connects real community posts using their cultural topics and categories.
                  Suggested searches open the public cultural atlas; they are not verified Qloo recommendations.
                </p>
                {exploreMoreLoading && <p role="status">Finding cultural connections...</p>}
                {selectedPost?.classification && (
                  <p className="integration-note">
                    Categories: {selectedPost.classification.categories.join(", ") || "Not classified"}.
                    Source: {selectedPost.classification.method === "groq" ? "Groq AI" :
                      selectedPost.classification.method === "keyword-fallback" ? "Keyword-based fallback" : "Explorer-provided"}.
                  </p>
                )}
                {selectedPost && selectedPost.user_id === me.id && (
                  <div className="integration-note">
                    {!editingCategories ? (
                      <button type="button" className="qloo-link-button" onClick={() => {
                        setCategoryDraft(selectedPost.classification?.categories || []);
                        setTopicDraft(selectedPost.topics.join(", "));
                        setEditingCategories(true);
                      }}>Correct my post categories</button>
                    ) : (
                      <div>
                        <strong>Choose categories</strong>
                        <div className="category-scroll">
                          {categories.map(cat => <button type="button" key={cat}
                            className={categoryDraft.includes(cat) ? "selected" : ""}
                            onClick={() => setCategoryDraft(old => old.includes(cat) ? old.filter(x => x !== cat) : old.length < 5 ? [...old, cat] : old)}>
                            {cat}
                          </button>)}
                        </div>
                        <label>Topics (comma-separated)</label>
                        <input value={topicDraft} onChange={e => setTopicDraft(e.target.value)} />
                        <button type="button" className="dark-button" onClick={() => void savePostCategories()}>Save categories</button>
                        <button type="button" onClick={() => setEditingCategories(false)}>Cancel</button>
                      </div>
                    )}
                  </div>
                )}
                {exploreMoreQueries.length > 0 && (
                  <div className="integration-note">
                    <h3>Explore across cultures</h3>
                    <p>Discover films, music, books, events and more connected to this interest.</p>
                    <div className="category-scroll">
                      {exploreMoreQueries.map(item => (
                        <button type="button" key={item.category} onClick={() => {
                          setSearch(item.query);
                          setCategory("");
                          go("explore");
                        }}>{item.category} <ChevronRight size={14} /></button>
                      ))}
                    </div>
                    <small>Searches use the existing Wikipedia cultural atlas, not live event availability.</small>
                  </div>
                )}

                {bridges.length ? (
                  bridges.map((bridge) => (
                    <div key={bridge.post.id}>
                      <button
                        className="bridge-result"
                        onClick={() => openPost(bridge.post)}
                      >
                        {bridge.post.image ? (
                          <img src={media(bridge.post.image)} alt="Related post" />
                        ) : <Globe2 size={26} />}
                        <span>
                          <strong>{bridge.post.body}</strong>
                          <small>Shared interests: {[...bridge.shared_topics, ...(bridge.shared_categories || [])].join(", ")}</small>
                        </span>
                        <ChevronRight size={18} />
                      </button>
                      <button type="button" className="qloo-link-button"
                        disabled={bridgeExplaining === bridge.post.id}
                        onClick={() => void explainBridge(bridge.post.id)}>
                        <Sparkles size={16} /> {bridgeExplaining === bridge.post.id ? "Connecting..." : "Explain cultural bridge with AI"}
                      </button>
                      {bridgeExplanations[bridge.post.id] && (
                        <div className="integration-note">
                          <AIResponse content={bridgeExplanations[bridge.post.id]} />
                          <small>Groq interpretation of real community posts, not a Qloo result.</small>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <p>
                    No matching community posts yet.
                  </p>
                )}

                <button
                  className="dark-button"
                  onClick={() => go("journeys")}
                >
                  Create My Journey
                </button>
              </div>
            </div>
          )}

          {page === "journeys" && (
            <div className="journeys-page">
              <form
                className="cream-panel journey-form"
                onSubmit={createJourney}
              >
                <div className="journey-people">
                  <Avatar user={me} size={55} />
                  <Plus size={22} />
                  <Users size={44} />
                </div>
                <h2>Cultural Journey</h2>
                <p>
                  Create an experience to explore together.
                </p>

                <label>
                  Choose a focus
                  <input
                    required
                    maxLength={80}
                    placeholder="Film, music, dining, travel..."
                    value={journeyForm.focus}
                    onChange={(e) => setJourneyForm({
                      ...journeyForm,
                      focus: e.target.value
                    })}
                  />
                </label>

                <div className="chips">
                  {categories.slice(0, 8).map((name) => (
                    <button
                      type="button"
                      key={name}
                      className={
                        journeyForm.focus === name
                          ? "selected" : ""
                      }
                      onClick={() => setJourneyForm({
                        ...journeyForm,
                        focus: name
                      })}
                    >
                      {name}
                    </button>
                  ))}
                </div>

                <label>
                  Choose the style
                  <select
                    value={journeyForm.style}
                    onChange={(e) => setJourneyForm({
                      ...journeyForm,
                      style: e.target.value
                    })}
                  >
                    <option>Comfort</option>
                    <option>Balanced</option>
                    <option>Adventurous</option>
                  </select>
                </label>

                <label>
                  Explore with
                  <select
                    value={journeyForm.partner_id}
                    onChange={(e) => setJourneyForm({
                      ...journeyForm,
                      partner_id: e.target.value
                    })}
                  >
                    <option value="">Solo journey</option>
                    {people.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.display_name}
                      </option>
                    ))}
                  </select>
                </label>

                <p className="integration-note">
                  Journeys are saved and editable. Open a journey to generate and save Groq itinerary suggestions.
                </p>

                <button className="dark-button">
                  Create Journey
                </button>
              </form>

              <section>
                <h2 className="section-title">
                  Journey Invitations{invitations.length ? ` (${invitations.length})` : ""}
                </h2>
                {invitations.length ? invitations.map((invite) => (
                  <div className="journey-card" key={`invite-${invite.id}`}>
                    <Route size={24} />
                    <span style={{ flex: 1 }}>
                      <strong>{invite.title}</strong>
                      <small>From {invite.inviter.display_name} · {invite.style}</small>
                      <small>{invite.focus}</small>
                    </span>
                    <button type="button" className="small-pill"
                      disabled={invitationBusy === invite.id}
                      onClick={() => void respondToJourney(invite.id, "accept")}>Accept</button>
                    <button type="button" className="small-pill"
                      disabled={invitationBusy === invite.id}
                      onClick={() => void respondToJourney(invite.id, "decline")}>Decline</button>
                  </div>
                )) : (
                  <p className="integration-note">No pending invitations.</p>
                )}
              </section>
              <section>
                <h2 className="section-title">Your Journeys</h2>
                {journeys.length ? (
                  journeys.map((journey) => {
                    const status = journey.plan.status || "accepted";
                    const active = status === "accepted";
                    return (
                      <button
                        key={journey.id}
                        className="journey-card"
                        disabled={!active}
                        onClick={() => {
                          setSelectedJourney(journey);
                          setActivities([]);
                          go("together");
                        }}
                      >
                        <Route size={26} />
                        <span>
                          <strong>{journey.title}</strong>
                          <small>{journey.style} · {journey.plan.activities.length} activities</small>
                          {status === "pending" && <small>Waiting for invitation acceptance</small>}
                          {status === "declined" && <small>Invitation declined</small>}
                        </span>
                        {active && <ChevronRight size={19} />}
                      </button>
                    );
                  })
                ) : (
                  <Empty
                    title="No journeys yet"
                    description="Create your first journey and invite an Explorer."
                  />
                )}
              </section>
            </div>
          )}

          {page === "together" && selectedJourney && (
            <div className="narrow-page">
              <div className="video-layout">
                <div className="video-frame">
                  <video
                    ref={localVideo}
                    autoPlay
                    playsInline
                    muted
                  />
                  <span>You</span>
                </div>
                <div className="video-frame remote-placeholder">
                  <Users size={44} />
                  <span>Explorer</span>
                </div>
              </div>

              <div className="call-toolbar">
                {!cameraOn ? (
                  <button onClick={startCamera}>
                    <Video size={21} /> Preview Camera
                  </button>
                ) : (
                  <>
                    <button onClick={() => {
                      localStream.current
                        ?.getAudioTracks()
                        .forEach((t) => {
                          t.enabled = !micOn;
                        });
                      setMicOn(!micOn);
                    }}>
                      {micOn ? <Mic /> : <MicOff />}
                    </button>
                    <button onClick={() => {
                      localStream.current
                        ?.getVideoTracks()
                        .forEach((t) => {
                          t.enabled = !cameraOn;
                        });
                      setCameraOn(!cameraOn);
                    }}>
                      {cameraOn ? <Video /> : <VideoOff />}
                    </button>
                    <button
                      className="hangup"
                      onClick={stopCamera}
                    >
                      <PhoneOff />
                    </button>
                  </>
                )}
              </div>

              <p className="integration-note">
                Camera preview is available with permission.
                A real two-person call requires completing the
                existing WebRTC signalling integration.
              </p>

              <section className="qloo-section qloo-journey-section">
                <span className="qloo-eyebrow"><Sparkles size={15} /> Shared taste discovery</span>
                <h3>Find ideas for this journey</h3>
                {qlooSeed ? (
                  <>
                    <p>Use <strong>{qlooSeed.name}</strong> as the starting interest. You can choose a different interest on Explore.</p>
                    <div className="qloo-control-row">
                      <select aria-label="Journey recommendation category" value={qlooTarget} onChange={(e) => setQlooTarget(e.target.value)}>
                        {qlooTargets.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                      </select>
                      <button type="button" disabled={journeyQlooBusy} onClick={() => void findJourneyQloo()}>
                        {journeyQlooBusy ? "Finding..." : "Find Journey Ideas"}
                      </button>
                    </div>
                    {qlooError && <p className="qloo-error" role="alert">{qlooError}</p>}
                    {journeyQlooResults.length > 0 && (
                      <div className="qloo-entity-grid">
                        {journeyQlooResults.map((item) => qlooEntityCard(item, qlooTarget))}
                      </div>
                    )}
                    <p className="qloo-hint">Suggestions are not automatically added to your shared plan. Add an activity below after agreeing with your Explorer.</p>
                  </>
                ) : (
                  <p>Choose an interest from live Qloo search on Explore to get journey recommendations here.</p>
                )}
                <button type="button" className="qloo-link-button" onClick={() => go("explore")}>Explore interests <ChevronRight size={17} /></button>
              </section>

              <div className="dark-panel">
                <h3>{selectedJourney.title}</h3>
                <p>{selectedJourney.focus}</p>
                <h3>Shared Plan</h3>
                <div className="qloo-section">
                  <span className="qloo-eyebrow"><Sparkles size={15} /> AI Journey Studio</span>
                  <p>Generate a suggested cultural itinerary from the journey focus and both participants' saved interests.</p>
                  <textarea
                    value={journeyNotes}
                    onChange={(e) => setJourneyNotes(e.target.value)}
                    maxLength={1000}
                    placeholder="Optional preferences, city, duration or budget..."
                    rows={3}
                  />
                  <button type="button" className="dark-button"
                    disabled={journeyGenerating}
                    onClick={() => void generateJourney()}>
                    {journeyGenerating ? "Creating your journey..." : "Generate & Save AI Itinerary"}
                  </button>
                  {(selectedJourney.plan as typeof selectedJourney.plan & {ai_suggestion?: {text: string}}).ai_suggestion && (
                    <div className="integration-note">
                      <strong>Saved AI suggestion · Not verified or booked</strong>
                      <AIResponse content={(selectedJourney.plan as typeof selectedJourney.plan & {ai_suggestion?: {text: string}}).ai_suggestion?.text || ""} />
                      <p>Discuss the suggestions together and add agreed activities to your Shared Plan below.</p>
                    </div>
                  )}
                </div>

                {activities.length ? activities.map((a) => (
                  <div className="activity-row" key={a.id}>
                    <Check size={17} />
                    <span style={{ flex: 1 }}>
                      <strong>{a.text}</strong>
                      <small style={{ display: "block", opacity: 0.7 }}>
                        {a.author ? `Added by ${a.author.display_name}` : "Added previously"}
                      </small>
                    </span>
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                      {(() => {
                        const votes = a.votes || {};
                        const yes = Object.values(votes).filter((v) => v === "yes").length;
                        const no = Object.values(votes).filter((v) => v === "no").length;
                        const required = selectedJourney.partner_id ? 2 : 1;
                        const mine = me ? votes[String(me.id)] : undefined;
                        const agreed = yes === required && no === 0;
                        return (
                          <>
                            <small aria-live="polite" style={{ opacity: 0.8 }}>
                              {agreed ? "Agreed by all" : no ? "Needs discussion" : `${yes}/${required} agreed`}
                            </small>
                            <button type="button" className="small-pill"
                              aria-label={`Agree to ${a.text}`}
                              aria-pressed={mine === "yes"}
                              disabled={votingActivityId !== null}
                              onClick={() => void voteJourneyActivity(a.id, mine === "yes" ? "clear" : "yes")}
                              style={{ borderColor: mine === "yes" ? "#c7a766" : undefined }}>
                              <Check size={15} /> Agree
                            </button>
                            <button type="button" className="small-pill"
                              aria-label={`Request changes to ${a.text}`}
                              aria-pressed={mine === "no"}
                              disabled={votingActivityId !== null}
                              onClick={() => void voteJourneyActivity(a.id, mine === "no" ? "clear" : "no")}
                              style={{ borderColor: mine === "no" ? "#c7a766" : undefined }}>
                              <X size={15} /> Discuss
                            </button>
                          </>
                        );
                      })()}
                    </div>
                    {a.author_id === me?.id && (
                      <button type="button" className="small-pill"
                        aria-label={`Remove ${a.text}`}
                        disabled={activityBusy}
                        onClick={() => void deleteJourneyActivity(a.id)}>
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                )) : <p className="integration-note">No activities yet. Add your first shared plan activity.</p>}

                <form
                  className="send-form"
                  onSubmit={addActivity}
                >
                  <input
                    required
                    placeholder="Add a real activity..."
                    value={activity}
                    onChange={(e) =>
                      setActivity(e.target.value)
                    }
                  />
                  <button><Plus size={19} /></button>
                </form>
              </div>
            </div>
          )}

          {page === "messages" && (
            <div className="messages-page">
              <div className="dark-panel">
                <h3>Messages</h3>
                {conversations.map((c) => (
                  <button
                    key={c.id}
                    className="conversation-row"
                    onClick={() => selectConversation(c)}
                  >
                    <Avatar user={c.other} />
                    <span>{c.other.display_name}</span>
                  </button>
                ))}
                {!conversations.length && (
                  <p className="muted">
                    No conversations yet.
                  </p>
                )}
              </div>

              <div className="dark-panel message-window">
                {currentConversation ? (
                  <>
                    <h3>
                      {currentConversation.other.display_name}
                    </h3>
                    <div className="message-list">
                      {messages.map((message) => (
                        <div
                          key={message.id}
                          className={
                            message.sender_id === me.id
                              ? "message mine"
                              : "message"
                          }
                        >
                          {message.body}
                        </div>
                      ))}
                    </div>
                    <form
                      className="send-form"
                      onSubmit={sendMessage}
                    >
                      <input
                        required
                        placeholder="Write a message..."
                        value={messageText}
                        onChange={(e) =>
                          setMessageText(e.target.value)
                        }
                      />
                      <button><Send size={18} /></button>
                    </form>
                  </>
                ) : (
                  <Empty
                    title="Your conversations"
                    description="Select an Explorer to start chatting."
                  />
                )}
              </div>
            </div>
          )}

          {page === "assistant" && (
            <div className="narrow-page">
              <div className="dark-panel ai-panel">
                <Sparkles size={32} />
                <h2>BYNTRA AI</h2>
                <p>
                  Discover culture through your interests.
                </p>
                <p className="integration-note">
                  BYNTRA AI is powered by Groq. Live Qloo taste
                  recommendations will become available once
                  Qloo API access is configured.
                </p>

                {aiResponse && (
                  <div className="ai-answer">
                    <AIResponse content={aiResponse} />
                  </div>
                )}

                <form className="send-form" onSubmit={askAI}>
                  <input
                    required
                    placeholder="Ask BYNTRA anything..."
                    value={aiInput}
                    onChange={(e) =>
                      setAiInput(e.target.value)
                    }
                  />
                  <button disabled={busy}>
                    <Send size={19} />
                  </button>
                </form>
              </div>
            </div>
          )}

          {page === "settings" && (
            <div className="narrow-page">
              <form
                className="dark-panel settings-form"
                onSubmit={saveProfile}
              >
                <h2>Edit Profile</h2>
                <div className="avatar-edit">
                  <Avatar user={me} size={86} />
                  <label>
                    <Camera size={18} />
                    Change photo
                    <input
                      hidden
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(e) =>
                        chooseImage(e, "avatar")
                      }
                    />
                  </label>
                </div>

                <label>
                  Display name
                  <input
                    required
                    value={profileForm.display_name}
                    onChange={(e) => setProfileForm({
                      ...profileForm,
                      display_name: e.target.value
                    })}
                  />
                </label>
                <label>
                  Bio
                  <textarea
                    rows={3}
                    maxLength={400}
                    value={profileForm.bio}
                    onChange={(e) => setProfileForm({
                      ...profileForm,
                      bio: e.target.value
                    })}
                  />
                </label>
                <label>
                  Location
                  <input
                    value={profileForm.location}
                    onChange={(e) => setProfileForm({
                      ...profileForm,
                      location: e.target.value
                    })}
                  />
                </label>

                <h3>Your Interests</h3>
                <div className="chips">
                  {categories.map((name) => (
                    <button
                      type="button"
                      key={name}
                      className={
                        profileForm.interests.includes(name)
                          ? "selected" : ""
                      }
                      onClick={() => setProfileForm((old) => ({
                        ...old,
                        interests: old.interests.includes(name)
                          ? old.interests.filter(
                              (x) => x !== name
                            )
                          : [...old.interests, name]
                      }))}
                    >
                      {name}
                    </button>
                  ))}
                </div>

                <button className="cream-button">
                  Save Profile
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={logout}
                >
                  Sign Out
                </button>
              </form>
            </div>
          )}
        </div>

        <nav className="mobile-nav">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={page === id ? "active" : ""}
              onClick={() => {
                if (id === "profile") setViewUser(me);
                go(id);
              }}
            >
              <Icon size={21} />
              <small>{label}</small>
            </button>
          ))}
             </nav>

        <FloatingByntraAI />
      </main>
    </div>
  );
}