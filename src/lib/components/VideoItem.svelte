<script lang="ts">
  interface Props {
    title: string;
    description: string;
    videoUrl: string;
  }
  let { title, description, videoUrl }: Props = $props();
</script>

<article class="mb-16 border-b border-gray-100 pb-16 last:border-0 last:pb-0">
  <div class="aspect-video w-full bg-gray-50 mb-6">
    <iframe 
      src={videoUrl} 
      title={title}
      class="w-full h-full" 
      frameborder="0" 
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
      allowfullscreen
    ></iframe>
  </div>
  <div class="max-w-3xl">
    <h2 class="text-2xl font-serif text-gray-900 mb-3">{title}</h2>
    <p class="text-gray-600 leading-relaxed">{description}</p>
  </div>
</article>
