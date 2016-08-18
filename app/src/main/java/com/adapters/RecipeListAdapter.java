package com.adapters;

import android.content.Context;
import android.content.Intent;
import android.support.v7.widget.CardView;
import android.support.v7.widget.RecyclerView;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import com.adapters.database.StroppingDatabase;
import com.classes.Recipe;
import com.oz10.stropping.R;
import com.oz10.stropping.RecipeEditActivity;

import java.util.ArrayList;
import java.util.List;

/**
 * Created by Austen on 08/08/2016.
 */
public class RecipeListAdapter extends RecyclerView.Adapter<RecipeListAdapter.RecipeViewHolder> {

    public static class RecipeViewHolder extends RecyclerView.ViewHolder{
        CardView cardView;
        TextView recipeId;
        TextView recipeName;

        RecipeViewHolder(View view){
            super(view);
            cardView = (CardView)view.findViewById(R.id.recipe_card_view);
            recipeId = (TextView)view.findViewById(R.id.recipe_id);
            recipeName = (TextView)view.findViewById(R.id.recipe_name);

            cardView.setOnClickListener(new View.OnClickListener(){
                @Override public void onClick(View view){
                    //TODO Open Edit Recipes activity
                    Intent intent = new Intent(cardView.getContext(), RecipeEditActivity.class);
                    intent.putExtra("RecipeId", Long.parseLong(recipeId.getText().toString()));
                    intent.putExtra("requestCode", 2);
                    cardView.getContext().startActivity(intent);
                }
            });
        }
    }

    List<Recipe> recipes;

    public RecipeListAdapter(List<Recipe> recipes){
        this.recipes = recipes;
    }

    @Override
    public RecipeViewHolder onCreateViewHolder(ViewGroup parent, int viewType) {
        View view = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_recipe, parent, false);
        RecipeViewHolder recipeViewHolder = new RecipeViewHolder(view);
        return recipeViewHolder;
    }

    @Override
    public void onBindViewHolder(RecipeViewHolder recipeViewHolder, int position) {
        recipeViewHolder.recipeId.setText(recipes.get(position).getId().toString());
        recipeViewHolder.recipeName.setText(recipes.get(position).name);
    }

    @Override
    public int getItemCount() {
        return recipes.size();
    }

    @Override
    public void onAttachedToRecyclerView(RecyclerView recyclerView) {
        super.onAttachedToRecyclerView(recyclerView);
    }

    public void add(Recipe recipe)
    {
        recipes.add(recipe);
    }

    public void updateAdapterFromDatabase(Context context)
    {
        StroppingDatabase db = new StroppingDatabase(context);
        db.open();

        this.recipes.clear();

        ArrayList<Recipe> recipes = db.getAllRecipes();
        for (Recipe recipe:recipes
             ) {
            add(recipe);
        }

        notifyDataSetChanged();

        db.close();

    }
}
