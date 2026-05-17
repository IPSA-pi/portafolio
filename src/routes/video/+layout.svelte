<script lang="ts">
    import { onMount, setContext } from 'svelte';
    import { page } from '$app/stores';

    interface Props {
        children?: import('svelte').Snippet;
    }

    let { children }: Props = $props();

    let ytReady = $state(false);
    setContext('ytReady', { get ytReady() { return ytReady; } });

    onMount(() => {
        if ((window as any).YT?.Player) {
            ytReady = true;
            return;
        }

        (window as any).onYouTubeIframeAPIReady = () => {
            ytReady = true;
        };

        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);

        return () => {
            delete (window as any).onYouTubeIframeAPIReady;
        };
    });

    const sections = [
        { href: '/video/cinema', label: 'Cinema' },
        { href: '/video/tv', label: 'TV' },
        { href: '/video/efectotv', label: 'EfectoTV' },
    ];
</script>

<div class="bg-black">
    <nav class="flex items-center gap-8 px-6 h-10 border-b border-white/10">
        {#each sections as section}
            <a
                href={section.href}
                class="text-xs font-medium tracking-widest uppercase transition-colors {$page.url.pathname === section.href
                    ? 'text-white'
                    : 'text-white/40 hover:text-white/70'}"
            >
                {section.label}
            </a>
        {/each}
    </nav>
    {@render children?.()}
</div>
