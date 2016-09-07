package com.adapters;

import android.content.Context;
import android.content.Intent;
import android.support.design.widget.Snackbar;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.BaseAdapter;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.TextView;

import com.adapters.database.StroppingDatabase;
import com.classes.Ingredient;
import com.classes.QuantityItem;
import com.classes.ShoppingListItem;
import com.oz10.stropping.IngredientEditActivity;
import com.oz10.stropping.R;

import java.util.ArrayList;
import java.util.List;

/**
 * Created by Austen on 27/08/2016.
 */
public class IngredientListAdapter extends BaseAdapter {

    public ArrayList<QuantityItem> _ingredientsList = new ArrayList<>();
    public ArrayList<Ingredient> _selectedIngredientsList = new ArrayList<>();
    private int _layoutResource;
    private LayoutInflater _layoutInflater;
    private Context _parentContent;

    public IngredientListAdapter(Context context, List objects, int layoutResource) {

        _ingredientsList = (ArrayList<QuantityItem>) objects;
        _layoutResource = layoutResource;
        _layoutInflater = LayoutInflater.from(context);
        _parentContent = context;
    }

    @Override
    public int getCount() {
        return _ingredientsList.size();
    }

    @Override
    public long getItemId(int i) {
        return i;
    }

    @Override
    public QuantityItem getItem(int i) {
        return _ingredientsList.get(i);
    }

    public void add(Ingredient ingredient)
    {
        _ingredientsList.add(ingredient);
    }

    @Override
    public View getView(int position, View convertView, final ViewGroup parent) {

        View view = convertView;

        // inflate
        if (view == null){
            view = _layoutInflater.inflate(_layoutResource, null);
        }

        // get ingredient
        final QuantityItem ingredient = _ingredientsList.get(position);

        // set default views (common across all layouts)
        if (ingredient != null) {
            SetIngredientName(view, ingredient.getName(), ingredient.getId(), parent);
            SetIngredientQuantity(view, ingredient.getQuantityText(), parent);

            switch (_layoutResource){
                case R.layout.item_shoppinglist:
                    break;
                case R.layout.item_ingredient:
                    SetIngredientIsSelected(view, (Ingredient)ingredient);
                    break;

                case R.layout.item_recipe_ingredient:
                    SetIngredientDeleteButton(view, (Ingredient)ingredient);
                    break;
            }
        }

        return view;
    }

    private void SetIngredientName(View view, final String ingredientName, final Long ingredientId, final ViewGroup parent)
    {
        TextView textView = (TextView) view.findViewById(R.id.ingredient_name);
        textView.setOnClickListener(new View.OnClickListener(){
                                        @Override
                                        public void onClick(View view) {
                                            Intent intent = new Intent(_parentContent, IngredientEditActivity.class);
                                            intent.putExtra("IngredientId", ingredientId);
                                            _parentContent.startActivity(intent);
                                        }
                                    }
        );
        textView.setText(ingredientName);
    }

    private void SetIngredientQuantity(View view, final String ingredientQuantity, final ViewGroup parent)
    {
        TextView textView = (TextView) view.findViewById(R.id.ingredient_quantity);
        textView.setOnClickListener(new View.OnClickListener(){
                                        @Override
                                        public void onClick(View view) {
                                            //TODO Open Edit ingredient activity
                                            Snackbar snackbar = Snackbar.make(parent, ingredientQuantity + " required!", Snackbar.LENGTH_SHORT);
                                            snackbar.show();
                                        }
                                    }
        );
        textView.setText(ingredientQuantity);
    }

    private void SetIngredientIsSelected(View view, final Ingredient ingredient)
    {
        CheckBox checkBox = (CheckBox) view.findViewById(R.id.ingredient_isselected);
        checkBox.setOnClickListener(new View.OnClickListener(){
                                        @Override
                                        public void onClick(View view) {
                                            CheckBox checkBox = (CheckBox) view; // view.findViewById(R.id.ingredient_isselected);
                                            ingredient.setIsSelected(checkBox.isChecked());

                                            if (ingredient.getIsSelected()){
                                                _selectedIngredientsList.add(ingredient);
                                            }else{
                                                _selectedIngredientsList.remove(ingredient);
                                            }
                                        }
                                    }
        );
        checkBox.setChecked(ingredient.getIsSelected());
    }

    private void SetIngredientDeleteButton(View view, final Ingredient ingredient)
    {
        Button button = (Button) view.findViewById(R.id.ingredient_delete);
        button.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                StroppingDatabase db = new StroppingDatabase(_parentContent);
                db.open();

                _ingredientsList.remove(ingredient);
                db.deleteIngredientFromRecipe(ingredient.getId());

                db.close();

                notifyDataSetChanged();
            }
        });
    }

    public void updateAdapterFromDatabase(Context context)
    {
        StroppingDatabase db = new StroppingDatabase(context);
        db.open();

        this._ingredientsList.clear();

        switch (_layoutResource){
            case R.layout.item_shoppinglist:
                ArrayList<ShoppingListItem> shoppingListItems = db.getAllShoppingListItems();
                for (ShoppingListItem shoppingListItem:shoppingListItems
                        ) {
                    _ingredientsList.add(shoppingListItem);
                }
                break;
            case R.layout.item_ingredient:
                ArrayList<Ingredient> ingredientListItems = db.getAllIngredients();
                for (Ingredient ingredientListItem:ingredientListItems
                        ) {
                    _ingredientsList.add(ingredientListItem);
                }
                break;
            case R.layout.item_recipe_ingredient:
                //ArrayList<ShoppingListItem> shoppingListItems1 = db.get
                break;
        }

        notifyDataSetChanged();

        db.close();

    }

}
